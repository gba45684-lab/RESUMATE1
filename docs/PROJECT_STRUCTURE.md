# ResuMate production structure

The repository is intentionally organized around a single production web entry point and Capacitor packaging:

```text
www/index.html
capacitor.config.ts
scripts/check-project.mjs
scripts/prepare-web.mjs
.github/workflows/build-apk.yml
```

The initial uploaded `ResuMate.zip` is consumed by CI. CI extracts the supported `www/app-source.html` entry into `www/index.html`, removes the temporary ZIP, validates the app, generates the Android Capacitor project, and builds `app-debug.apk`.

This keeps the approved UI source intact while removing the ZIP-as-project problem.
