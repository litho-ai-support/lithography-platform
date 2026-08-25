<!-- docs/layout.md -->

# Layout

- The app shell owns header, navigation, main content, and AI sidecar placement.
- The sidecar stays outside `<Outlet />` so route changes do not reset it by default.
- Main routes must remain useful when the sidecar is closed.
- Avoid nested cards and decorative page section cards.
