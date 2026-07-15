# Renderer adapters

`project(run)` returns view data independent of the DOM. Pass an adapter as the second argument or consume the result yourself. `semanticAdapter(root)` rebuilds accessible structural HTML for generic data. `canvasAdapter(canvas, {draw})` clears a 2D canvas and invokes a custom drawing callback; without one it draws JSON-like text.

Adapters render only. Input handlers should select an object from `availability(run)` and dispatch it. The Studio demonstrates both adapters side-by-side. Production applications should add game-specific semantics, keyboard support, focus treatment, and responsive drawing.
