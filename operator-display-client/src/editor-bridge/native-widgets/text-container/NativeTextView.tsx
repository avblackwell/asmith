import React, { useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent, ReactElement } from "react";
import { createPortal } from "react-dom";
import styled from "styled-components";
import Interweave from "interweave";
import { EmailMatcher, UrlMatcher } from "interweave-autolink";
import { LinkFilter } from "./LinkFilter";
import { fontSizeUtility, OverflowTypes } from "./textShared";
import { WidgetStyleContainer } from "./WidgetStyleContainer";

/**
 * Read-only adaptation of Appsmith TextWidget/component (Apache-2.0).
 * The HTML parser, link filter, font mapping, and overflow rules follow the
 * source component. Blueprint's Text, legacy Icon, and editor modal are
 * replaced with local elements so the widget has no Appsmith store edge.
 */
export interface NativeTextViewProps {
  widgetId: string;
  text?: string;
  textAlign?: "LEFT" | "CENTER" | "RIGHT" | "JUSTIFY";
  fontSize?: string;
  fontFamily?: string;
  fontStyle?: string;
  textColor?: string;
  backgroundColor?: string;
  accentColor?: string;
  truncateButtonColor?: string;
  borderColor?: string;
  borderWidth?: number | string;
  minHeight?: number;
  overflow?: OverflowTypes;
  disableLink?: boolean;
  isLoading?: boolean;
}

const ELLIPSIS_HEIGHT = 15;

const TextContainer = styled.div<{ $fontFamily?: string }>`
  height: 100%;
  width: 100%;
  position: relative;
  font-family: ${(props) => props.$fontFamily
    ? `${props.$fontFamily}, var(--ads-v2-font-family), Arial, sans-serif`
    : "inherit"};

  ul { list-style-type: disc; list-style-position: inside; }
  ol { list-style-type: decimal; list-style-position: inside; }
  ul ul, ol ul { list-style-type: circle; list-style-position: inside; margin-left: 15px; }
  ol ol, ul ol { list-style-type: lower-latin; list-style-position: inside; margin-left: 15px; }
  h1 { font-size: 2em; margin: 0.67em 0; }
  h2 { font-size: 1.5em; margin: 0.75em 0; }
  h3 { font-size: 1.17em; margin: 0.83em 0; }
  h5 { font-size: 0.83em; margin: 1.5em 0; }
  h6 { font-size: 0.75em; margin: 1.67em 0; }
  h1, h2, h3, h4, h5, h6 { font-weight: bold; }
  a { color: #106ba3; text-decoration: none; }
  a:hover { text-decoration: underline; }
`;

interface TextSurfaceStyle {
  $overflow: OverflowTypes;
  $isTruncated: boolean;
  $textAlign: string;
  $backgroundColor?: string;
  $textColor?: string;
  $fontStyle?: string;
  $fontSize?: string;
  $minHeight?: number;
  $isLoading?: boolean;
}

const TextSurface = styled.div<TextSurfaceStyle>`
  height: ${(props) => props.$overflow === OverflowTypes.TRUNCATE
    ? `calc(100% - ${ELLIPSIS_HEIGHT}px)` : "100%"};
  width: 100%;
  display: flex;
  justify-content: flex-start;
  flex-direction: ${(props) => props.$isTruncated ? "column" : "unset"};
  align-items: ${(props) => props.$overflow === OverflowTypes.NONE ? "center" : "flex-start"};
  overflow-x: hidden;
  overflow-y: ${(props) => props.$overflow === OverflowTypes.SCROLL ? "auto" : "hidden"};
  text-overflow: ellipsis;
  background: ${(props) => props.$backgroundColor};
  color: ${(props) => props.$textColor};
  font-style: ${(props) => props.$fontStyle?.includes("ITALIC") ? "italic" : "normal"};
  text-decoration: ${(props) => props.$fontStyle?.includes("UNDERLINE") ? "underline" : "none"};
  font-weight: ${(props) => props.$fontStyle?.includes("BOLD") ? "bold" : "normal"};
  font-size: ${(props) => fontSizeUtility(props.$fontSize) || "1rem"};
  word-break: break-word;

  & > span {
    width: 100%;
    line-height: 1.2;
    white-space: pre-wrap;
    text-align: ${(props) => props.$textAlign.toLowerCase()};
    min-height: ${(props) => props.$minHeight ? `${props.$minHeight}px` : "auto"};
  }

  ${(props) => props.$isLoading && `
    color: transparent;
    background: linear-gradient(90deg, #e5e9ec, #f3f5f7, #e5e9ec);
  `}
`;

const TruncateButton = styled.button<{ $backgroundColor?: string; $color: string }>`
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: ${ELLIPSIS_HEIGHT}px;
  padding: 0;
  border: 0;
  background: ${(props) => props.$backgroundColor || "transparent"};
  color: ${(props) => props.$color};
  font-size: 18px;
  line-height: 10px;
  text-align: center;
  cursor: pointer;
`;

const ModalBackdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgb(0 0 0 / 35%);
`;

const ModalPanel = styled.div<{ $backgroundColor?: string }>`
  width: min(500px, 95vw);
  max-height: 80vh;
  overflow: auto;
  padding: 16px 24px 24px;
  border-radius: 4px;
  background: ${(props) => props.$backgroundColor || "white"};
  box-shadow: 0 8px 28px rgb(0 0 0 / 20%);
`;

const ModalHeading = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #393c40;
  font-size: 20px;
  font-weight: 500;
  line-height: 24px;

  button { border: 0; background: transparent; color: inherit; font-size: 22px; cursor: pointer; }
`;

const ModalText = styled.div<TextSurfaceStyle>`
  padding-top: 16px;
  overflow-wrap: break-word;
  white-space: pre-wrap;
  text-align: ${(props) => props.$textAlign.toLowerCase()};
  color: ${(props) => props.$textColor};
  font-size: ${(props) => fontSizeUtility(props.$fontSize) || "1rem"};
  font-style: ${(props) => props.$fontStyle?.includes("ITALIC") ? "italic" : "normal"};
  text-decoration: ${(props) => props.$fontStyle?.includes("UNDERLINE") ? "underline" : "none"};
  font-weight: ${(props) => props.$fontStyle?.includes("BOLD") ? "bold" : "normal"};
`;

export function NativeTextView(props: NativeTextViewProps): ReactElement {
  const {
    accentColor = "#553de9",
    backgroundColor,
    borderColor,
    borderWidth,
    disableLink = false,
    fontFamily,
    fontSize,
    fontStyle,
    isLoading = false,
    minHeight,
    overflow = OverflowTypes.NONE,
    text = "",
    textAlign = "LEFT",
    textColor,
    truncateButtonColor,
    widgetId,
  } = props;
  const textRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [isTruncated, setIsTruncated] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const filter = useMemo(() => new LinkFilter(), []);
  const matchers = useMemo(() =>
    disableLink || ((!text.includes("\n") && text.length > 1000) || text.length > 50000)
      ? []
      : [new EmailMatcher("email"), new UrlMatcher("url")],
  [disableLink, text]);

  useEffect(() => {
    if (overflow !== OverflowTypes.TRUNCATE) {
      setIsTruncated(false);
      return;
    }

    const node = textRef.current;
    if (!node) return;
    const measure = () => setIsTruncated(node.scrollHeight > node.offsetHeight);
    measure();

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [overflow, text, fontSize, fontFamily, fontStyle, minHeight]);

  useEffect(() => {
    if (!showModal) return;
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowModal(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [showModal]);

  const modalStyle: TextSurfaceStyle = {
    $overflow: overflow,
    $isTruncated: isTruncated,
    $textAlign: textAlign,
    $textColor: textColor,
    $fontSize: fontSize,
    $fontStyle: fontStyle,
  };
  const content = (
    <Interweave content={text} filters={[filter]} matchers={matchers} newWindow />
  );
  const openModal = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setShowModal(true);
  };

  return (
    <WidgetStyleContainer
      borderColor={borderColor}
      borderWidth={borderWidth}
      className="t--text-widget-container"
      widgetId={widgetId}
    >
      <TextContainer
        $fontFamily={fontFamily && fontFamily !== "System Default" ? fontFamily : undefined}
        data-native-widget="text"
        data-testid={`native-text-${widgetId}`}
      >
        <TextSurface
          {...modalStyle}
          $backgroundColor={backgroundColor}
          $isLoading={isLoading}
          className={isLoading ? "bp3-skeleton" : "bp3-ui-text"}
          ref={textRef}
        >
          <span>{content}</span>
        </TextSurface>
        {isTruncated && (
          <TruncateButton
            $backgroundColor={backgroundColor}
            $color={truncateButtonColor || accentColor}
            aria-label="Show more text"
            className="t--widget-textwidget-truncate"
            onClick={openModal}
            type="button"
          >
            ⋯
          </TruncateButton>
        )}
      </TextContainer>
      {showModal && typeof document !== "undefined" && createPortal(
        <ModalBackdrop onClick={() => setShowModal(false)}>
          <ModalPanel
            $backgroundColor={backgroundColor}
            aria-label="Full text"
            aria-modal="true"
            className="t--widget-textwidget-truncate-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <ModalHeading>
              <span>Show More</span>
              <button aria-label="Close full text" onClick={() => setShowModal(false)} ref={closeButtonRef} type="button">×</button>
            </ModalHeading>
            <ModalText {...modalStyle}>{content}</ModalText>
          </ModalPanel>
        </ModalBackdrop>,
        document.body,
      )}
    </WidgetStyleContainer>
  );
}
