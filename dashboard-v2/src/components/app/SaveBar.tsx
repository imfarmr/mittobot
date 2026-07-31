import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Loader2, Save, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SaveBarProps {
  dirty: boolean;
  saving?: boolean;
  onSave: () => void;
  onReset?: () => void;
}

export function SaveBar({ dirty, saving, onSave, onReset }: SaveBarProps) {
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  // Warn before navigating away with unsaved changes.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  return (
    <AnimatePresence>
      {dirty && (
        <div className="fixed bottom-6 left-0 right-0 z-50 flex justify-center px-4 pointer-events-none">
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: "spring", stiffness: 450, damping: 30 }}
            className="pointer-events-auto flex w-full max-w-xl items-center justify-between gap-4 rounded-2xl border border-border/60 bg-card/95 px-5 py-3 shadow-2xl backdrop-blur-2xl"
          >
            <div className="flex items-center gap-2.5">
              <span className="text-xs font-semibold tracking-wide text-foreground">
                You have unsaved changes
              </span>
            </div>

            <div className="flex items-center gap-2">
              {onReset && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onReset}
                  disabled={saving}
                  className="h-8 text-xs"
                >
                  <Undo2 className="size-3.5 mr-1" /> Reset
                </Button>
              )}
              <Button
                size="sm"
                onClick={onSave}
                disabled={saving}
                className="h-8 text-xs font-semibold px-4"
              >
                {saving ? (
                  <Loader2 className="size-3.5 animate-spin mr-1" />
                ) : (
                  <Save className="size-3.5 mr-1" />
                )}
                {saving ? "Saving…" : "Save Changes"}
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
