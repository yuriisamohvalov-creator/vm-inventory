package app

import (
	"net/http"

	"github.com/go-chi/chi/v5"
)

func (a *App) RegisterRoutes(r chi.Router) {
	r.Get("/api", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{"status": "ok"})
	})
	r.Get("/api/", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{"status": "ok"})
	})
	r.Get("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})

	r.Route("/api", func(api chi.Router) {
		api.Use(a.authMiddleware)
		api.Get("/", func(w http.ResponseWriter, _ *http.Request) {
			writeJSON(w, http.StatusOK, map[string]any{"status": "ok"})
		})
		a.registerAuthRoutes(api)
		a.registerDepartmentRoutes(api)
		a.registerStreamRoutes(api)
		a.registerInfoSystemRoutes(api)
		a.registerVMRoutes(api)
		a.registerPoolRoutes(api)
		a.registerReportRoutes(api)
		a.registerImportRoutes(api)
		a.registerSearchRoutes(api)
	})

	r.Get("/swagger/", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/api/docs/", http.StatusFound)
	})
	r.Get("/redoc/", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/api/docs/", http.StatusFound)
	})
	r.Get("/api/docs/", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{
			"title":       "VM Inventory API",
			"description": "Swagger was available in Django backend. Go backend keeps endpoint for compatibility.",
		})
	})
}
