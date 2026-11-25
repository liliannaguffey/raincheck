# RainCheck development

- Read docs/DEVELOPMENT_PLAN.md before starting a phase. Update its status as milestones land.
- Use npm workspaces. Keep UI and HTTP client code in client, Express and provider integrations in server, and cross-boundary contracts in shared.
- Use strict TypeScript. Validate requests at the API boundary and keep route, weather, and scoring logic independent of HTTP and UI code.
- Use UTC timestamps internally and display times in the relevant local time zone. Distinguish missing forecasts and mock data from live results.
- Keep credentials in ignored environment files and server-only keys on the server. Commit placeholder templates.
- Mock providers in automated tests. Run applicable lint, build, format, and test commands before committing and the full suite before closing a phase.
- Work on develop and make focused Conventional Commits. Review the staged diff for secrets and generated output. Push every two to four meaningful commits and at phase boundaries after verifying origin. Keep history intact and use reviewed pull requests for milestones.
