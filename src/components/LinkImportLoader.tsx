import { lazy, Suspense, type ComponentProps } from "react";
import { BottomSheet, Skeleton } from "./ui";
const Import = lazy(() =>
  import("./LinkImport").then((module) => ({ default: module.LinkImport })),
);
type Props = ComponentProps<(typeof import("./LinkImport"))["LinkImport"]>;
export function LinkImport(props: Props) {
  return (
    <Suspense
      fallback={
        <BottomSheet title="Додати з посилання" onClose={props.onClose}>
          <Skeleton />
        </BottomSheet>
      }
    >
      <Import {...props} />
    </Suspense>
  );
}
