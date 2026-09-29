import showdown from "showdown";

export const RICH_TEXT_DEFAULTS = {
  defaultText: "This is the initial <b>content</b> of the editor",
  rows: 20,
  columns: 24,
  animateLoading: true,
  isDisabled: false,
  isVisible: true,
  isRequired: false,
  widgetName: "RichTextEditor",
  isDefaultClickDisabled: true,
  inputType: "html",
  labelText: "Label",
  labelPosition: "Top",
  labelAlignment: "LEFT",
  labelWidth: 5,
  version: 1,
  responsiveBehavior: "fill",
  minWidth: 450,
  flexVerticalAlignment: "start",
} as const;

export const RICH_TEXT_DEFAULT_PROPERTIES = { text: "defaultText" } as const;

const markdownConverter = new showdown.Converter();

/** Matches RichTextEditorWidget.getWidgetView: markdown becomes editor HTML. */
export function richTextEditorValue(text: string, inputType: unknown): string {
  return inputType === "markdown" ? markdownConverter.makeHtml(text) : text;
}

/** Matches Appsmith's derived `isValid` property. */
export function richTextIsValid(text: string, required: unknown): boolean {
  return required === true ? text.length > 0 : true;
}
