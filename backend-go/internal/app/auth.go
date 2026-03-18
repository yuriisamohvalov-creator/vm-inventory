package app

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"golang.org/x/crypto/bcrypt"
)

const (
	roleAdmin   = "admin"
	roleAnalyst = "analyst"
)

type contextKey string

const authUserContextKey contextKey = "auth_user"

type AuthUser struct {
	ID         int64     `json:"id"`
	Username   string    `json:"username"`
	Role       string    `json:"role"`
	IsActive   bool      `json:"is_active"`
	MustChange bool      `json:"must_change_password"`
	AuthSource string    `json:"auth_source"`
	LDAPGroups []string  `json:"ldap_groups,omitempty"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}

type authUserWithPassword struct {
	AuthUser
	PasswordHash string
}

type authLoginResponse struct {
	Token     string   `json:"token"`
	TokenType string   `json:"token_type"`
	ExpiresAt string   `json:"expires_at"`
	User      AuthUser `json:"user"`
}

func (a *App) registerAuthRoutes(api chi.Router) {
	api.Post("/auth/login/", a.authLogin)
	api.Get("/auth/me/", a.authMe)
	api.Post("/auth/logout/", a.authLogout)
	api.Post("/auth/change-password/", a.authChangePassword)

	api.Get("/auth/users/", a.listAuthUsers)
	api.Post("/auth/users/", a.createAuthUser)
	api.Patch("/auth/users/{id}/", a.updateAuthUser)
}

func (a *App) authMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodOptions {
			next.ServeHTTP(w, r)
			return
		}

		path := strings.TrimSuffix(r.URL.Path, "/")
		if path == "/api/auth/login" {
			next.ServeHTTP(w, r)
			return
		}

		token := parseBearerToken(r.Header.Get("Authorization"))
		if token == "" {
			writeJSON(w, http.StatusUnauthorized, map[string]any{"detail": "Требуется авторизация."})
			return
		}

		ctx, cancel := withTimeout(r.Context())
		defer cancel()
		user, err := a.userByToken(ctx, token)
		if err != nil {
			writeJSON(w, http.StatusUnauthorized, map[string]any{"detail": "Недействительный или просроченный токен."})
			return
		}

		if strings.HasPrefix(path, "/api/auth/users") && user.Role != roleAdmin {
			writeJSON(w, http.StatusForbidden, map[string]any{"detail": "Доступ к управлению пользователями только для администратора."})
			return
		}
		if user.MustChange {
			allowedWhileChangingPassword := path == "/api/auth/me" || path == "/api/auth/logout" || path == "/api/auth/change-password"
			if !allowedWhileChangingPassword {
				writeJSON(w, http.StatusForbidden, map[string]any{"detail": "Требуется смена пароля перед началом работы."})
				return
			}
		}
		if user.Role == roleAnalyst && !isReadOnlyMethod(r.Method) {
			writeJSON(w, http.StatusForbidden, map[string]any{"detail": "Роль аналитика имеет доступ только на чтение и экспорт отчётов."})
			return
		}

		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), authUserContextKey, user)))
	})
}

func currentUser(ctx context.Context) (AuthUser, bool) {
	u, ok := ctx.Value(authUserContextKey).(AuthUser)
	return u, ok
}

func (a *App) authLogin(w http.ResponseWriter, r *http.Request) {
	type loginPayload struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	var p loginPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Некорректный JSON."})
		return
	}

	ctx, cancel := withTimeout(r.Context())
	defer cancel()

	user, err := a.authenticateLocalUser(ctx, strings.TrimSpace(p.Username), p.Password)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]any{"detail": "Неверный логин или пароль."})
		return
	}

	token, expiresAt, err := a.createSessionToken(ctx, user.ID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "Не удалось создать сессию."})
		return
	}

	writeJSON(w, http.StatusOK, authLoginResponse{
		Token:     token,
		TokenType: "Bearer",
		ExpiresAt: expiresAt.UTC().Format(time.RFC3339),
		User:      user.AuthUser,
	})
}

func (a *App) authMe(w http.ResponseWriter, r *http.Request) {
	u, ok := currentUser(r.Context())
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]any{"detail": "Требуется авторизация."})
		return
	}
	writeJSON(w, http.StatusOK, u)
}

func (a *App) authLogout(w http.ResponseWriter, r *http.Request) {
	token := parseBearerToken(r.Header.Get("Authorization"))
	if token == "" {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	ctx, cancel := withTimeout(r.Context())
	defer cancel()
	_, _ = a.DB.Exec(ctx, `DELETE FROM vm_auth_session_token WHERE token_hash=$1`, tokenHash(token))
	w.WriteHeader(http.StatusNoContent)
}

func (a *App) authChangePassword(w http.ResponseWriter, r *http.Request) {
	u, ok := currentUser(r.Context())
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]any{"detail": "Требуется авторизация."})
		return
	}
	type payload struct {
		CurrentPassword string `json:"current_password"`
		NewPassword     string `json:"new_password"`
	}
	var p payload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Некорректный JSON."})
		return
	}
	if len(strings.TrimSpace(p.NewPassword)) < 8 {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Новый пароль должен содержать минимум 8 символов."})
		return
	}
	ctx, cancel := withTimeout(r.Context())
	defer cancel()

	user, err := a.authenticateLocalUser(ctx, u.Username, p.CurrentPassword)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]any{"detail": "Неверный текущий пароль."})
		return
	}
	newHash, err := hashPassword(p.NewPassword)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "Не удалось обновить пароль."})
		return
	}
	_, err = a.DB.Exec(ctx, `
		UPDATE vm_auth_user
		SET password_hash=$2, must_change_password=FALSE, updated_at=NOW()
		WHERE id=$1
	`, user.ID, newHash)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "Не удалось сохранить новый пароль."})
		return
	}
	updated, err := a.getAuthUserByID(ctx, user.ID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "Не удалось получить пользователя."})
		return
	}
	writeJSON(w, http.StatusOK, updated.AuthUser)
}

func (a *App) listAuthUsers(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := withTimeout(r.Context())
	defer cancel()
	rows, err := a.DB.Query(ctx, `
		SELECT id, username, role, is_active, must_change_password, auth_source, ldap_groups, created_at, updated_at
		FROM vm_auth_user
		ORDER BY username
	`)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}
	defer rows.Close()

	out := make([]AuthUser, 0)
	for rows.Next() {
		var item AuthUser
		if err := scanAuthUser(rows, &item); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
			return
		}
		out = append(out, item)
	}
	writeJSON(w, http.StatusOK, out)
}

func (a *App) createAuthUser(w http.ResponseWriter, r *http.Request) {
	type payload struct {
		Username   string   `json:"username"`
		Password   string   `json:"password"`
		Role       string   `json:"role"`
		IsActive   *bool    `json:"is_active"`
		MustChange *bool    `json:"must_change_password"`
		LDAPGroups []string `json:"ldap_groups"`
	}
	var p payload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Некорректный JSON."})
		return
	}
	if len(strings.TrimSpace(p.Password)) < 8 {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Пароль должен содержать минимум 8 символов."})
		return
	}
	ctx, cancel := withTimeout(r.Context())
	defer cancel()

	user, err := a.insertLocalUser(
		ctx,
		strings.TrimSpace(p.Username),
		p.Password,
		normalizeRole(p.Role),
		boolFromPtr(p.IsActive, true),
		boolFromPtr(p.MustChange, false),
		normalizeGroups(p.LDAPGroups),
	)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusCreated, user)
}

func (a *App) updateAuthUser(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]any{"detail": "Not found."})
		return
	}
	type payload struct {
		Role       *string   `json:"role"`
		IsActive   *bool     `json:"is_active"`
		MustChange *bool     `json:"must_change_password"`
		Password   *string   `json:"password"`
		LDAPGroups *[]string `json:"ldap_groups"`
	}
	var p payload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Некорректный JSON."})
		return
	}
	ctx, cancel := withTimeout(r.Context())
	defer cancel()

	curr, err := a.getAuthUserByID(ctx, id)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]any{"detail": "Not found."})
		return
	}

	if p.Role != nil {
		curr.Role = normalizeRole(*p.Role)
	}
	if p.IsActive != nil {
		curr.IsActive = *p.IsActive
	}
	if p.MustChange != nil {
		curr.MustChange = *p.MustChange
	}
	if p.LDAPGroups != nil {
		curr.LDAPGroups = normalizeGroups(*p.LDAPGroups)
	}

	var passwordHash = curr.PasswordHash
	if p.Password != nil {
		if len(strings.TrimSpace(*p.Password)) < 8 {
			writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Пароль должен содержать минимум 8 символов."})
			return
		}
		hash, err := hashPassword(*p.Password)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "Не удалось обновить пароль."})
			return
		}
		passwordHash = hash
	}

	_, err = a.DB.Exec(ctx, `
		UPDATE vm_auth_user
		SET role=$2, is_active=$3, password_hash=$4, ldap_groups=$5, must_change_password=$6, updated_at=NOW()
		WHERE id=$1
	`, id, curr.Role, curr.IsActive, passwordHash, toJSON(curr.LDAPGroups), curr.MustChange)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": err.Error()})
		return
	}

	updated, err := a.getAuthUserByID(ctx, id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, updated.AuthUser)
}

func (a *App) authenticateLocalUser(ctx context.Context, username string, password string) (authUserWithPassword, error) {
	var user authUserWithPassword
	if username == "" || password == "" {
		return user, errors.New("missing credentials")
	}
	row := a.DB.QueryRow(ctx, `
		SELECT id, username, password_hash, role, is_active, must_change_password, auth_source, ldap_groups, created_at, updated_at
		FROM vm_auth_user
		WHERE username=$1
	`, username)
	if err := scanAuthUserWithPassword(row, &user); err != nil {
		return user, err
	}
	if !user.IsActive {
		return user, errors.New("inactive user")
	}
	if bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)) != nil {
		return user, errors.New("invalid password")
	}
	// Future-proof extension point: when LDAP groups are available, role can be resolved from group mapping.
	if roleFromGroups, _ := a.resolveRoleFromLDAPGroups(ctx, user.LDAPGroups); roleFromGroups != "" {
		user.Role = roleFromGroups
	}
	return user, nil
}

func (a *App) insertLocalUser(ctx context.Context, username, password, role string, isActive bool, mustChange bool, ldapGroups []string) (AuthUser, error) {
	var out AuthUser
	if username == "" {
		return out, errors.New("Логин обязателен.")
	}
	if role != roleAdmin && role != roleAnalyst {
		return out, errors.New("Недопустимая роль. Используйте admin или analyst.")
	}
	hash, err := hashPassword(password)
	if err != nil {
		return out, err
	}
	err = a.DB.QueryRow(ctx, `
		INSERT INTO vm_auth_user (username, password_hash, role, is_active, must_change_password, auth_source, ldap_groups, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, 'local', $6, NOW(), NOW())
		RETURNING id, username, role, is_active, must_change_password, auth_source, ldap_groups, created_at, updated_at
	`, username, hash, role, isActive, mustChange, toJSON(ldapGroups)).Scan(
		&out.ID, &out.Username, &out.Role, &out.IsActive, &out.MustChange, &out.AuthSource, &out.LDAPGroups, &out.CreatedAt, &out.UpdatedAt,
	)
	return out, err
}

func (a *App) getAuthUserByID(ctx context.Context, id int64) (authUserWithPassword, error) {
	var out authUserWithPassword
	row := a.DB.QueryRow(ctx, `
		SELECT id, username, password_hash, role, is_active, must_change_password, auth_source, ldap_groups, created_at, updated_at
		FROM vm_auth_user
		WHERE id=$1
	`, id)
	err := scanAuthUserWithPassword(row, &out)
	return out, err
}

func (a *App) userByToken(ctx context.Context, token string) (AuthUser, error) {
	var out AuthUser
	row := a.DB.QueryRow(ctx, `
		SELECT u.id, u.username, u.role, u.is_active, u.must_change_password, u.auth_source, u.ldap_groups, u.created_at, u.updated_at
		FROM vm_auth_session_token t
		JOIN vm_auth_user u ON u.id=t.user_id
		WHERE t.token_hash=$1 AND t.expires_at > NOW()
	`, tokenHash(token))
	if err := scanAuthUser(row, &out); err != nil {
		return out, err
	}
	if !out.IsActive {
		return out, errors.New("inactive user")
	}
	_, _ = a.DB.Exec(ctx, `UPDATE vm_auth_session_token SET last_used_at=NOW() WHERE token_hash=$1`, tokenHash(token))
	return out, nil
}

func (a *App) createSessionToken(ctx context.Context, userID int64) (string, time.Time, error) {
	token, err := generateToken()
	if err != nil {
		return "", time.Time{}, err
	}
	expiresAt := time.Now().UTC().Add(time.Duration(a.Cfg.AuthTokenTTLMinutes) * time.Minute)
	_, err = a.DB.Exec(ctx, `
		INSERT INTO vm_auth_session_token (user_id, token_hash, expires_at, created_at, last_used_at)
		VALUES ($1, $2, $3, NOW(), NOW())
	`, userID, tokenHash(token), expiresAt)
	if err != nil {
		return "", time.Time{}, err
	}
	return token, expiresAt, nil
}

func (a *App) ensureBootstrapUser(ctx context.Context) error {
	var usersCount int64
	if err := a.DB.QueryRow(ctx, `SELECT COUNT(*) FROM vm_auth_user`).Scan(&usersCount); err != nil {
		return err
	}
	if usersCount > 0 {
		return nil
	}
	_, err := a.insertLocalUser(
		ctx,
		strings.TrimSpace(a.Cfg.BootstrapUsername),
		strings.TrimSpace(a.Cfg.BootstrapPassword),
		normalizeRole(a.Cfg.BootstrapRole),
		true,
		true,
		nil,
	)
	return err
}

func (a *App) EnsureAuthBootstrap(ctx context.Context) error {
	return a.ensureBootstrapUser(ctx)
}

func (a *App) resolveRoleFromLDAPGroups(ctx context.Context, groups []string) (string, error) {
	if len(groups) == 0 {
		return "", nil
	}
	normalized := normalizeGroups(groups)
	if len(normalized) == 0 {
		return "", nil
	}
	rows, err := a.DB.Query(ctx, `
		SELECT role
		FROM vm_auth_ldap_group_role_map
		WHERE LOWER(ldap_group_dn) = ANY($1)
		ORDER BY CASE role WHEN 'admin' THEN 1 ELSE 2 END
		LIMIT 1
	`, normalized)
	if err != nil {
		return "", err
	}
	defer rows.Close()
	var role string
	if rows.Next() {
		if err := rows.Scan(&role); err != nil {
			return "", err
		}
	}
	return normalizeRole(role), nil
}

func normalizeRole(role string) string {
	role = strings.ToLower(strings.TrimSpace(role))
	if role == roleAdmin || role == roleAnalyst {
		return role
	}
	return roleAdmin
}

func normalizeGroups(groups []string) []string {
	out := make([]string, 0, len(groups))
	seen := make(map[string]struct{}, len(groups))
	for _, g := range groups {
		n := strings.ToLower(strings.TrimSpace(g))
		if n == "" {
			continue
		}
		if _, exists := seen[n]; exists {
			continue
		}
		seen[n] = struct{}{}
		out = append(out, n)
	}
	return out
}

func parseBearerToken(header string) string {
	parts := strings.SplitN(strings.TrimSpace(header), " ", 2)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
		return ""
	}
	return strings.TrimSpace(parts[1])
}

func isReadOnlyMethod(method string) bool {
	return method == http.MethodGet || method == http.MethodHead || method == http.MethodOptions
}

func boolFromPtr(v *bool, fallback bool) bool {
	if v == nil {
		return fallback
	}
	return *v
}

func generateToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func tokenHash(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func hashPassword(password string) (string, error) {
	trimmed := strings.TrimSpace(password)
	if trimmed == "" {
		return "", errors.New("Пароль обязателен.")
	}
	hashed, err := bcrypt.GenerateFromPassword([]byte(trimmed), bcrypt.DefaultCost)
	return string(hashed), err
}

type rowScanner interface {
	Scan(dest ...any) error
}

func scanAuthUser(row rowScanner, dst *AuthUser) error {
	var groupsRaw []byte
	if err := row.Scan(
		&dst.ID, &dst.Username, &dst.Role, &dst.IsActive, &dst.MustChange, &dst.AuthSource, &groupsRaw, &dst.CreatedAt, &dst.UpdatedAt,
	); err != nil {
		return err
	}
	dst.LDAPGroups = toTags(groupsRaw)
	return nil
}

func scanAuthUserWithPassword(row rowScanner, dst *authUserWithPassword) error {
	var groupsRaw []byte
	if err := row.Scan(
		&dst.ID, &dst.Username, &dst.PasswordHash, &dst.Role, &dst.IsActive, &dst.MustChange, &dst.AuthSource, &groupsRaw, &dst.CreatedAt, &dst.UpdatedAt,
	); err != nil {
		return err
	}
	dst.LDAPGroups = toTags(groupsRaw)
	return nil
}
