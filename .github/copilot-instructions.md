# VM Inventory - Copilot Workspace Instructions

## Purpose
Provide concise, project-specific guidance for AI agents working in `vm-inventory`.

- Backend: Django REST API in `backend/`
- Frontend: React + Vite SPA in `frontend/`
- Deployment: Docker Compose in repo root
- Docs: `README.md`, `docs/*.md`

## Recommended development flow
1. `cp .env.example .env`
2. `docker compose up -d`
3. Open http://localhost
4. Backend local manual: `cd backend && python -m venv venv && source venv/bin/activate && pip install -r requirements.txt`
5. Frontend manual: `cd frontend && npm install && npm run dev`

## Key commands
- `docker compose up -d` (healthy, includes db migrations + frontend build)
- `docker compose down` (cleanup)
- `cd backend && python manage.py makemigrations && python manage.py migrate`
- `cd backend && python manage.py createsuperuser`
- `cd frontend && npm run lint` (none currently, add as needed)

## Architecture notes
- Django app: `backend/inventory` (models, serializers, views, permissions, reports)
- Django project settings: `backend/vm_inventory/settings.py`
- API root: `/api/` (auth/login/me/logout, departments, streams, info-systems, vms, pools, report)
- Frontend pages: `frontend/src/pages/{Admin,Login,Pools,Reports,VMs}.jsx`
- Auth: token-based plus optional LDAP via `backend/vm_inventory/auth_ldap.py`

## Code conventions and expectations
- Keep database migrations in `backend/inventory/migrations/`
- Follow Django model/serializer/view separation
- For UI, use existing React pattern in `frontend/src` with minimal CSS (Tailwind not used)
- Use existing JSON structure from backend APIs to avoid breaking assumptions

## Useful docs (link, don’t duplicate)
- `README.md` – start/dev/environment
- `docs/DEPLOYMENT.md` – prod deployment notes
- `docs/USER_GUIDE.md` – user flows
- `docs/ADMIN_GUIDE.md` – admin operations
- `backend/requirements.txt` and `docker-compose.yml` – runtime dependencies

## Particular agent guidance
- If editing backend endpoints, update `backend/inventory/serializers.py` and `backend/inventory/views.py` first.
- If adding fields to VM or Pool models, update models + migrations + serializer + permissions + tests (currently no tests in repo).
- For frontend changes, maintain router in `frontend/src/App.jsx` and component structure in `frontend/src/pages`.

## Missing/unclear bits to ask about
- No CI/test automation detected; ask if they want to add `pytest`/`npm test` and where to run.
- No existing lint config in repo; ask preferred formatter (`black`, `ruff`, `prettier`).

## Quick prompts for agent users
- "Refactor `backend/inventory/views.py` so `GET /api/vms/` supports `status` query parameter and add tests for status filtering."
- "Implement frontend filtering in `frontend/src/pages/VMs.jsx` using `status` from API and keep existing table style."

## For future agent customization
- Add file instructions in `.github/instructions/` for `backend/**/*.py` and `frontend/**/*.jsx` with more restrictive applyTo patterns.
- Add hooks for pre-commit linting and migrations check.
