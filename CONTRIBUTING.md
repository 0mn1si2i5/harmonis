# Contributing

Use Node.js 24+ and follow [development](docs/development.md). Keep provider-specific request parameters visible and accurate; avoid inventing generic controls that cannot map to the selected API.

Use a temporary library for development. Tests must not require personal API keys or spend provider credits. Run `npm run check`, `npm test`, and Python tests when changing the composer. For desktop changes, also exercise a packaged app.

Keep pull requests focused, describe behavior changes and relevant validation, and include screenshots for visible UI changes. Never include personal media, credentials or machine-specific paths. Commit messages should describe the resulting change, not the review/debugging process.

Contributions are made under the project's MIT license; preserve third-party notices and disclose any additional licensing requirements.
