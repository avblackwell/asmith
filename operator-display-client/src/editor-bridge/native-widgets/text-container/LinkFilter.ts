import { Filter } from "interweave";
import { addHttpIfMissing } from "./textShared";

/** Appsmith's TextWidget link normalization, kept beside the renderer. */
export class LinkFilter extends Filter {
  attribute(name: string, value: string): string {
    return name === "href" ? addHttpIfMissing(value) : value;
  }
}
