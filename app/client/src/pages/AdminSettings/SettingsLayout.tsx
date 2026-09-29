import React from "react";
import type { ReactNode } from "react";
import { Icon, Text } from "@appsmith/ads";
import styled, { css } from "styled-components";

/** The visual frame shared by Appsmith settings and standalone admin pages. */
export const AdminSettingsFrame = styled.div`
  display: flex;
  height: 100%;
  min-height: 0;
`;

/** Main pane for screens that supply their own content instead of SettingsForm. */
export const AdminSettingsContent = styled.main`
  flex: 1;
  min-width: 0;
  overflow: auto;
  padding: var(--ads-v2-spaces-7);
`;

export const SidebarWrapper = styled.div`
  flex-basis: ${(props) => props.theme.sidebarWidth};
  overflow-y: auto;
  border-right: 1px solid var(--ads-v2-color-border);
  flex-shrink: 0;
  padding: 12px 0;

  &::-webkit-scrollbar {
    display: none;
  }

  > div:not(:first-child) {
    border-top: 1px solid var(--ads-v2-color-border);
  }
`;

export const HeaderContainer = styled.div`
  margin: 12px;
`;

export const StyledHeader = styled(Text)`
  height: 20px;
  margin: 16px;
  color: var(--ads-v2-color-fg-emphasis);
`;

export const CategoryList = styled.ul`
  margin: 0;
  list-style-type: none;
`;

export const CategoryItem = styled.li``;

export const navLinkStyles = css<{ $active: boolean }>`
  padding: 8px 16px;
  border-radius: var(--ads-v2-border-radius);
  background-color: ${(props) =>
    props.$active ? `var(--ads-v2-color-bg-muted)` : ""};
  text-decoration: none !important;

  .ads-v2-text {
    display: flex;
    gap: var(--ads-v2-spaces-3);
    align-items: center;
  }

  && {
    color: var(--ads-v2-color-fg);
  }

  &:hover {
    text-decoration: none;
  }

  &:hover:not(.active) {
    background-color: var(--ads-v2-color-bg-subtle);
  }
`;

export const StyledNativeLink = styled.a<{ $active: boolean }>`
  ${navLinkStyles}
  display: flex;
  align-items: center;
  gap: var(--ads-v2-spaces-3);
`;

export const SettingName = styled(Text)<{ active?: boolean }>`
  color: ${(props) =>
    props.active
      ? "var(--ads-v2-color-fg-emphasis-plus)"
      : "var(--ads-v2-color-fg)"};
  font-weight: 400;
`;

export interface AdminSettingsNavItem {
  title: string;
  slug: string;
  icon?: string;
  children?: AdminSettingsNavItem[];
  isFeatureEnabled?: boolean;
  isEnterprise?: boolean;
}

export interface AdminSettingsNavSection {
  title: string;
  items: AdminSettingsNavItem[];
}

export interface AdminSettingsNavLinkProps {
  item: AdminSettingsNavItem;
  href: string;
  active: boolean;
  badge?: ReactNode;
  onClick?: () => void;
}

export interface AdminSettingsNavigationProps {
  sections: AdminSettingsNavSection[];
  currentCategory: string;
  currentSubCategory?: string;
  hrefForCategory: (
    item: AdminSettingsNavItem,
    parent?: AdminSettingsNavItem,
  ) => string;
  onCategoryClick?: (item: AdminSettingsNavItem) => void;
  renderBadge?: (item: AdminSettingsNavItem) => ReactNode;
  renderLink?: (props: AdminSettingsNavLinkProps) => ReactNode;
  showSubCategories?: boolean;
  ariaLabel?: string;
}

function NativeLink({
  active,
  badge,
  href,
  item,
  onClick,
}: AdminSettingsNavLinkProps) {
  return (
    <StyledNativeLink
      $active={active}
      aria-current={active ? "page" : undefined}
      className={active ? "active" : undefined}
      href={href}
      onClick={onClick}
    >
      {item.icon && <Icon name={item.icon} size="md" />}
      <SettingName active={active}>{item.title}</SettingName>
      {badge}
    </StyledNativeLink>
  );
}

/** Backend-neutral version of Appsmith's grouped admin settings sidebar. */
export function AdminSettingsNavigation({
  ariaLabel = "Settings navigation",
  currentCategory,
  currentSubCategory,
  hrefForCategory,
  onCategoryClick,
  renderBadge,
  renderLink = NativeLink,
  sections,
  showSubCategories = false,
}: AdminSettingsNavigationProps) {
  const renderItems = (
    items: AdminSettingsNavItem[],
    parent?: AdminSettingsNavItem,
  ) => (
    <CategoryList className="t--settings-category-list">
      {items.map((item) => {
        const active = parent
          ? currentSubCategory === item.slug
          : currentCategory === item.slug;

        return (
          <CategoryItem key={item.slug}>
            {renderLink({
              item,
              active,
              href: hrefForCategory(item, parent),
              badge: renderBadge?.(item),
              onClick: onCategoryClick
                ? () => onCategoryClick(item)
                : undefined,
            })}
            {showSubCategories && item.children?.length
              ? renderItems(item.children, item)
              : null}
          </CategoryItem>
        );
      })}
    </CategoryList>
  );

  return (
    <SidebarWrapper as="nav" aria-label={ariaLabel}>
      {sections
        .filter((section) => section.items.length > 0)
        .map((section) => (
          <HeaderContainer key={section.title}>
            <StyledHeader kind="heading-s" renderAs="p">
              {section.title}
            </StyledHeader>
            {renderItems(section.items)}
          </HeaderContainer>
        ))}
    </SidebarWrapper>
  );
}
