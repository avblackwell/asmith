declare module "*.svg" {
  import type { ComponentType, SVGProps } from "react";

  export const ReactComponent: ComponentType<SVGProps<SVGSVGElement>>;
  const url: string;
  export default url;
}

declare module "*.css";

declare module "*.png" {
  const url: string;
  export default url;
}
