<!-- docs/ui-stack-rules.md -->

# UI Stack Rules

This file defines UI stack ownership. Visual quality and AI-generated UI constraints are covered by
[ui-design/README.md](./ui-design/README.md).

- Ant Design owns business UI controls, feedback, cards, forms, and layout primitives.
- Ant Design X owns AI conversation, prompts, and sender controls.
- Tailwind owns wrapper layout only.
- Do not attach Tailwind `className` to Ant Design or Ant Design X component bodies.
- Use Ant Design tokens and CSS variables for colors, radius, shadows, and layers.
- Dark mode is controlled by the `.dark` class.
