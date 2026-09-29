import React, { useEffect, useState } from "react";
import type { KeyboardEvent, MouseEvent, ReactElement, ReactNode } from "react";
import { Alignment, Button, Icon, Menu, MenuItem as BlueprintMenuItem } from "@blueprintjs/core";
import type { IconName } from "@blueprintjs/icons";
import { Popover2 } from "@blueprintjs/popover2";
import styled from "styled-components";
import type { AppsmithWidgetDsl } from "../../../document";
import {
  buttonSurface,
  safeButtonColor,
  safeButtonRadius,
  safeButtonShadow,
} from "../button-controls/buttonControlsModel";
import { cardViewModel } from "./viewModel";
import type { CardItem } from "./viewModel";

const Article = styled.article<{
  $horizontal: boolean; $background: string; $border: string; $borderWidth: number;
  $radius: string; $shadow: string; $selected: boolean; $accent: string;
  $disabled: boolean; $interactive: boolean; $hoverElevation: boolean;
}>`
  display: flex;
  flex-direction: ${({ $horizontal }) => $horizontal ? "row" : "column"};
  width: 100%; height: 100%; overflow: hidden;
  background: ${({ $background }) => $background};
  border: ${({ $borderWidth, $border }) => `${$borderWidth}px solid ${$border}`};
  border-radius: ${({ $radius }) => $radius};
  box-shadow: ${({ $shadow }) => $shadow};
  ${({ $selected, $accent }) => $selected ? `border-color: ${$accent}; outline: 1px solid ${$accent}; outline-offset: -1px;` : ""}
  ${({ $interactive }) => $interactive ? `cursor: pointer; &:focus-visible { outline: 2px solid var(--wds-accent-color, #716E6E); outline-offset: 2px; }` : ""}
  ${({ $disabled }) => $disabled ? "opacity: 0.6; cursor: not-allowed;" : ""}
  ${({ $hoverElevation, $disabled, $shadow }) => $hoverElevation && !$disabled ? `
    transition: box-shadow 0.2s ease-in-out;
    &:hover { box-shadow: ${$shadow !== "none" ? `${$shadow}, ` : ""}0 6px 20px 0 rgba(0, 0, 0, 0.15); }
  ` : ""}
`;

const Column = styled.div`
  display: flex; flex-direction: column; flex: 1 1 auto; min-width: 0; min-height: 0;
`;
const Media = styled.div<{ $position: "TOP" | "LEFT"; $height: number }>`
  flex-shrink: 0; position: relative; overflow: hidden;
  ${({ $position, $height }) => $position === "TOP"
    ? `height: ${$height}px; width: 100%;` : "width: 120px; height: 100%;"}
  & > img { display: block; width: 100%; height: 100%; }
`;
const MediaFallback = styled.div`
  display: flex; align-items: center; justify-content: center; gap: 8px;
  width: 100%; height: 100%; padding: 8px; background: #fafafa;
  color: #716E6E; font-size: 12px; text-align: center;
`;
const Header = styled.div<{ $divider: boolean }>`
  display: flex; align-items: center; flex-shrink: 0; gap: 10px;
  height: 50px; padding: 0 12px;
  border-bottom: ${({ $divider }) => $divider ? "1px solid #E8E8E8" : "none"};
`;
const Avatar = styled.img`
  width: 32px; height: 32px; border-radius: 50%; object-fit: cover; flex-shrink: 0;
`;
const AvatarIcon = styled.div`
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  width: 32px; height: 32px; border-radius: 50%; background: #f0f0f0;
  color: #716E6E;
`;
const Titles = styled.div`
  display: flex; flex-direction: column; justify-content: center; flex: 1 1 auto; min-width: 0;
  & > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  & > span:first-child { font-size: 14px; font-weight: 600; color: #090707; }
  & > span:last-child { font-size: 12px; color: #716E6E; }
`;
const Badge = styled.span<{ $color: string; $customColor: boolean }>`
  flex-shrink: 0; max-width: 40%; padding: 2px 8px; border-radius: 10px;
  background: ${({ $color }) => $color};
  color: ${({ $color, $customColor }) => $customColor
    ? buttonSurface("PRIMARY", $color).foreground : "#090707"};
  font-size: 11px; font-weight: 600;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
`;
const HeaderButton = styled.button`
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  width: 28px; height: 28px; border: 0; border-radius: 4px; background: transparent;
  color: #716E6E; cursor: pointer;
  &:hover:not(:disabled) { background: #f0f0f0; }
  &:focus-visible { outline: 2px solid var(--wds-accent-color, #716E6E); }
  &:disabled { cursor: not-allowed; }
`;
const MenuItem = styled(BlueprintMenuItem)<{ $backgroundColor?: string; $textColor?: string }>`
  font-family: var(--wds-font-family);
  ${({ $backgroundColor }) => $backgroundColor ? `background-color: ${$backgroundColor} !important;` : ""}
  ${({ $textColor }) => $textColor ? `color: ${$textColor} !important;` : ""}
`;
const Body = styled.div<{ $scroll: boolean }>`
  position: relative; flex: 1 1 auto; min-height: 0; overflow: hidden;
  ${({ $scroll }) => $scroll ? "overflow-y: auto; overflow-x: hidden; scrollbar-color: #cccccc transparent; scrollbar-width: thin;" : ""}
`;
const Footer = styled.div<{ $divider: boolean }>`
  display: flex; align-items: center; justify-content: flex-end;
  flex-shrink: 0; gap: 8px; height: 48px; padding: 0 12px;
  border-top: ${({ $divider }) => $divider ? "1px solid #E8E8E8" : "none"};
  & > * { height: 32px; }
`;
const FooterButton = styled(Button)`
  background-image: none !important;
  box-shadow: none !important;
  padding: 0 10px;
  gap: 8px;
  font-family: var(--wds-font-family, Inter, Arial, sans-serif);
  font-size: 14px;
  font-weight: 500;
`;

function stringProp(value: unknown, fallback = ""): string {
  return typeof value === "string" && !value.includes("{{") ? value : fallback;
}

function itemButton(item: CardItem, primary: string, radius: string,
  disabled: boolean, onClick?: (id: string) => void): ReactElement {
  const variant = item.buttonVariant ?? "PRIMARY";
  const color = safeButtonColor(item.buttonColor, primary);
  const surface = buttonSurface(variant, color);
  return <FooterButton
    aria-label={item.label}
    disabled={disabled || item.isDisabled}
    icon={item.iconName && item.iconAlign !== Alignment.RIGHT ? item.iconName as IconName : undefined}
    key={item.id}
    onClick={onClick ? () => onClick(item.id) : undefined}
    rightIcon={item.iconName && item.iconAlign === Alignment.RIGHT ? item.iconName as IconName : undefined}
    style={{ background: surface.background, color: surface.foreground,
      border: surface.border, borderRadius: radius }}
    text={item.label}
    type="button"
  />;
}

export interface NativeCardViewProps {
  widget: AppsmithWidgetDsl;
  children?: ReactNode;
  themePrimaryColor?: string;
  themeBorderRadius?: string;
  themeBoxShadow?: string;
  onCardClick?: () => void;
  onToggleSelection?: () => void;
  onToggleExpand?: () => void;
  onFooterActionClick?: (id: string) => void;
  onMenuItemClick?: (id: string) => void;
}

/** CardWidget/component's Fixed zones with local, callback-driven meta actions. */
export function NativeCardView(props: NativeCardViewProps): ReactElement {
  const { widget } = props;
  const model = cardViewModel(widget);
  const [mediaError, setMediaError] = useState(false);
  useEffect(() => setMediaError(false), [widget.mediaImage]);
  const disabled = widget.isDisabled === true;
  const interactive = !disabled && (widget.selectionEnabled === true || widget.isClickable === true);
  const title = stringProp(widget.title);
  const subtitle = stringProp(widget.subtitle);
  const name = title.trim() || subtitle.trim() || widget.widgetName;
  const primary = props.themePrimaryColor ?? "#03B365";
  const radius = safeButtonRadius(widget.borderRadius, props.themeBorderRadius ?? "0px");
  const shadow = safeButtonShadow(stringProp(widget.boxShadow, props.themeBoxShadow ?? "none"));
  const bodyId = `card-body-${widget.widgetId}`;
  const activate = () => {
    if (disabled) return;
    if (widget.selectionEnabled === true) props.onToggleSelection?.();
    else if (widget.isClickable === true) props.onCardClick?.();
  };
  const click = (event: MouseEvent<HTMLElement>) => {
    if (!interactive || !event.currentTarget.contains(event.target as Node) ||
      (event.target as HTMLElement).closest(
        '[data-card-zone="body"], [data-card-zone="footer"], [data-card-zone="menu"], [data-card-zone="expand"]')) return;
    activate();
  };
  const keyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!interactive || event.target !== event.currentTarget ||
      (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    activate();
  };

  return <Article
    $accent={safeButtonColor(widget.selectedAccentColor, primary)}
    $background={safeButtonColor(widget.backgroundColor, "#FFFFFF")}
    $border={safeButtonColor(widget.borderColor, "#E0DEDE")}
    $borderWidth={Math.max(0, parseInt(stringProp(widget.borderWidth, "0"), 10) || 0)}
    $disabled={disabled}
    $horizontal={model.hasMedia && model.mediaPosition === "LEFT"}
    $hoverElevation={widget.hoverElevation === true}
    $interactive={interactive}
    $radius={radius}
    $selected={widget.selectionEnabled === true && model.selected}
    $shadow={shadow}
    aria-disabled={disabled || undefined}
    aria-label={interactive ? name : undefined}
    aria-pressed={widget.selectionEnabled === true ? model.selected : undefined}
    data-card-zone="card"
    data-native-widget="card"
    data-testid={`native-card-${widget.widgetId}`}
    onClick={click}
    onKeyDown={keyDown}
    role={interactive ? "button" : undefined}
    tabIndex={interactive ? 0 : undefined}
  >
    {model.hasMedia && <Media
      $height={Math.max(0, Number(widget.mediaHeight) || 140)}
      $position={model.mediaPosition as "TOP" | "LEFT"}
      data-card-zone="media"
      className={widget.isLoading === true ? "bp3-skeleton" : undefined}
    >{mediaError ? <MediaFallback data-testid="t--card-media-error">
      <Icon icon="media" iconSize={16} />Unable to display the image
    </MediaFallback> :
      <img alt={stringProp(widget.mediaAltText)} onError={() => setMediaError(true)}
        src={stringProp(widget.mediaImage)}
        style={{ objectFit: widget.mediaObjectFit === "contain" ? "contain" : "cover" }} />}
    </Media>}
    <Column>
      {widget.showHeader !== false && <Header
        $divider={widget.showHeaderDivider !== false}
        className={widget.isLoading === true ? "bp3-skeleton" : undefined}
        data-card-zone="header">
        {typeof widget.avatarImage === "string" && widget.avatarImage &&
          <Avatar alt="" src={widget.avatarImage} />}
        {!widget.avatarImage && typeof widget.avatarIcon === "string" &&
          <AvatarIcon><Icon icon={widget.avatarIcon as IconName} iconSize={16} /></AvatarIcon>}
        <Titles>{title && <span>{title}</span>}{subtitle && <span>{subtitle}</span>}</Titles>
        {typeof widget.badgeText === "string" && widget.badgeText &&
          <Badge $color={safeButtonColor(widget.badgeColor, "#EBEBEB")}
            $customColor={typeof widget.badgeColor === "string" &&
              !widget.badgeColor.includes("{{")}>{widget.badgeText}</Badge>}
        {widget.expandCollapseEnabled === true && <HeaderButton
          aria-controls={bodyId}
          aria-expanded={model.expanded}
          aria-label="Toggle card expanded state"
          data-card-zone="expand"
          data-testid="t--card-expand-toggle"
          disabled={disabled}
          onClick={props.onToggleExpand}
          type="button"
        ><Icon icon={model.expanded ? "chevron-up" : "chevron-down"} iconSize={16} />
        </HeaderButton>}
        {model.menuItems.length > 0 && <Popover2
          content={<Menu>{model.menuItems.map((item) => {
            const icon = item.iconName
              ? <Icon color={item.iconColor} icon={item.iconName as IconName} /> : null;
            return <MenuItem
              $backgroundColor={item.backgroundColor}
              $textColor={item.textColor}
              disabled={item.isDisabled}
              icon={item.iconAlign !== Alignment.RIGHT ? icon : null}
              key={item.id}
              labelElement={item.iconAlign === Alignment.RIGHT ? icon : null}
              onClick={() => props.onMenuItemClick?.(item.id)}
              text={item.label}
            />;
          })}</Menu>}
          disabled={disabled}
          minimal
          placement="bottom-end"
        >
          <HeaderButton aria-haspopup="menu" aria-label="Card actions menu"
            data-card-zone="menu" disabled={disabled} type="button">
            <Icon icon="more" iconSize={16} />
          </HeaderButton>
        </Popover2>}
      </Header>}
      {model.expanded && <Body $scroll={widget.shouldScrollContents === true}
        className={`${widget.shouldScrollContents === true ? "canvas " : ""}appsmith_widget_${widget.widgetId}`}
        data-card-zone="body" id={bodyId}>{props.children}</Body>}
      {widget.showFooter !== false && model.expanded && model.footerActions.length > 0 &&
        <Footer $divider={widget.showFooterDivider !== false}
          className={widget.isLoading === true ? "bp3-skeleton" : undefined}
          data-card-zone="footer">
          {model.footerActions.map((item) => itemButton(item, primary, radius,
            disabled, props.onFooterActionClick))}
        </Footer>}
    </Column>
  </Article>;
}
