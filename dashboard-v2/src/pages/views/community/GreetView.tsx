import WelcomeLeaveView from "./WelcomeLeaveView";
import LoggingView from "./LoggingView";

// Compatibility wrapper for older imports. New routes should use the focused
// WelcomeLeaveView and LoggingView pages directly.
export default function GreetView({ loggingOnly = false }: { loggingOnly?: boolean }) {
  return loggingOnly ? <LoggingView /> : <WelcomeLeaveView />;
}
