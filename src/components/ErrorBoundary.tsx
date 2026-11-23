import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "./ui";

type ErrorBoundaryProps = {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
};

type ErrorBoundaryState = {
  hasError: boolean;
  error: Error | null;
};

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  override state: ErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("[ErrorBoundary] Unhandled render error:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  handleReload = () => {
    window.location.reload();
  };

  override render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          className="empty-state p-6 my-auto text-center flex flex-col items-center justify-center min-h-[220px]"
          style={{ maxWidth: 420, margin: "40px auto" }}
        >
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center mb-4"
            style={{
              background: "rgba(239, 68, 68, 0.12)",
              color: "#EF4444",
            }}
          >
            <AlertCircle size={26} aria-hidden="true" />
          </div>
          <h3 className="text-lg font-semibold mb-2">
            {this.props.fallbackTitle ?? "Щось пішло не так"}
          </h3>
          <p className="text-sm opacity-80 mb-5 max-w-xs">
            Виникла неочікувана помилка відображення. Спробуйте оновити екран або перезавантажити сторінку.
          </p>
          <div className="flex gap-2">
            <Button type="button" onClick={this.handleReset}>
              <RefreshCw size={15} />
              <span>Спробувати знову</span>
            </Button>
            <Button
              type="button"
              className="button-ghost"
              onClick={this.handleReload}
            >
              <span>Оновити сторінку</span>
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
