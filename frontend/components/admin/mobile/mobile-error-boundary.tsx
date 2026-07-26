"use client";

import { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCcw } from "lucide-react";

import { Card } from "@/components/ui/card";

interface MobileErrorBoundaryProps {
  children: ReactNode;
}

interface MobileErrorBoundaryState {
  hasError: boolean;
}

export class MobileErrorBoundary extends Component<
  MobileErrorBoundaryProps,
  MobileErrorBoundaryState
> {
  state: MobileErrorBoundaryState = {
    hasError: false
  };

  static getDerivedStateFromError(): MobileErrorBoundaryState {
    return {
      hasError: true
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Mobile scanner error", error, errorInfo);
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <Card className="space-y-4 border-red-200 bg-red-50">
        <div className="inline-flex rounded-2xl bg-red-100 p-3 text-red-700">
          <AlertTriangle className="size-5" />
        </div>
        <div>
          <h2 className="text-2xl font-semibold text-red-950">
            Mobile scanner failed to load
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-red-800">
            Refresh the page and try again. The error was logged to the browser console.
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-2 rounded-full bg-red-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-800"
        >
          <RefreshCcw className="size-4" />
          Refresh page
        </button>
      </Card>
    );
  }
}
