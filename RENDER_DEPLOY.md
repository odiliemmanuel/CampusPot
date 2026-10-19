# API deploys from `main`

The `Deploy API to Render` workflow calls the API service's Render deploy hook
after every push to `main`. Render's native auto-deploy is disabled in
`render.yaml` so one push does not start two builds.

## One-time GitHub setup

1. Open the `campuspot-api` service in Render and copy its deploy hook from
   **Settings → Deploy Hook**.
2. In GitHub, open **Settings → Secrets and variables → Actions → New repository
   secret**.
3. Add a repository secret named `RENDER_DEPLOY_HOOK_URL` and paste in the
   hook URL.

Once that secret is set, pushes to `main` trigger a Render deploy. The workflow
can also be run manually from the GitHub Actions tab. It reports a clear error
if the secret has not been configured. Keep the hook URL private and regenerate
it in Render if it is exposed.
