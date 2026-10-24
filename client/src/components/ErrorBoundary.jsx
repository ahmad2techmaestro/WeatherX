import { Component } from "react";

export default class ErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error("[WeatherX] render error:", error);
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <div className="state state--error" role="alert">
        <h3>This page ran into a problem</h3>
        <p>Reloading the page usually resolves it.</p>
        <button type="button" className="btn btn--primary" onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    );
  }
}
