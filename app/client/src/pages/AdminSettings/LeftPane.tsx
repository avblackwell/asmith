import React from "react";
import styled from "styled-components";
import AdminConfig from "ee/pages/AdminSettings/config";
import {
  CategoryType,
  type Category,
} from "ee/pages/AdminSettings/config/types";
import { adminSettingsCategoryUrl } from "ee/RouteBuilder";
import { useParams } from "react-router";
import AnalyticsUtil from "ee/utils/AnalyticsUtil";
import { Link } from "@appsmith/ads";
import { useDispatch, useSelector } from "react-redux";
import { ReduxActionTypes } from "ee/constants/ReduxActionConstants";
import { getCurrentUser } from "selectors/usersSelectors";
import BusinessTag from "components/BusinessTag";
import EnterpriseTag from "components/EnterpriseTag";
import { getOrganizationPermissions } from "ee/selectors/organizationSelectors";
import {
  getFilteredOrgCategories,
  getFilteredUserManagementCategories,
  getFilteredInstanceCategories,
} from "ee/utils/adminSettingsHelpers";
import { useFeatureFlag } from "utils/hooks/useFeatureFlag";
import { FEATURE_FLAG } from "ee/entities/FeatureFlag";
import { getHasAuditLogsReadPermission } from "ee/utils/BusinessFeatures/permissionPageHelpers";
import { getShowAdminSettings } from "ee/utils/BusinessFeatures/adminSettingsHelpers";
import {
  AdminSettingsNavigation,
  navLinkStyles,
  SettingName,
} from "./SettingsLayout";
import type {
  AdminSettingsNavItem,
  AdminSettingsNavLinkProps,
  AdminSettingsNavSection,
} from "./SettingsLayout";

/** The stock Appsmith router link uses the same styling as native links. */
export const StyledLink = styled(Link)<{ $active: boolean }>`
  ${navLinkStyles}
`;

export function getSettingsCategory(type: string): Category[] {
  return AdminConfig.categories.filter(
    (category) => category.categoryType === type,
  );
}

function AppsmithRouterLink({
  active,
  badge,
  href,
  item,
  onClick,
}: AdminSettingsNavLinkProps) {
  return (
    <StyledLink
      $active={active}
      className={`t--settings-category-${item.slug} ${active ? "active" : ""}`}
      onClick={onClick}
      startIcon={item.isFeatureEnabled === false ? "lock-2-line" : item.icon}
      target="_self"
      to={href}
    >
      <SettingName active={active}>{item.title}</SettingName>
      {badge}
    </StyledLink>
  );
}

function getBadge(item: AdminSettingsNavItem) {
  if (item.isFeatureEnabled !== false) return null;

  return item.isEnterprise ? <EnterpriseTag /> : <BusinessTag />;
}

export default function LeftPane() {
  const profileCategories = getSettingsCategory(CategoryType.PROFILE);
  const organizationCategories = getSettingsCategory(CategoryType.ORGANIZATION);
  const userManagementCategories = getSettingsCategory(
    CategoryType.USER_MANAGEMENT,
  );
  const instanceCategories = getSettingsCategory(CategoryType.INSTANCE);
  const { category, selected: subCategory } = useParams<{
    category: string;
    selected?: string;
  }>();
  const dispatch = useDispatch();
  const user = useSelector(getCurrentUser);
  const isSuperUser = user?.isSuperUser;
  const organizationPermissions = useSelector(getOrganizationPermissions);
  const isFeatureEnabled = useFeatureFlag(FEATURE_FLAG.license_gac_enabled);
  const isAuditLogsEnabled = getHasAuditLogsReadPermission(
    isFeatureEnabled,
    organizationPermissions,
  );
  const showAdminSettings = getShowAdminSettings(isFeatureEnabled, user);

  const sections: AdminSettingsNavSection[] = [
    { title: "Profile", items: profileCategories },
    {
      title: "Organisation",
      items: getFilteredOrgCategories(
        organizationCategories,
        isAuditLogsEnabled,
        isSuperUser,
      ),
    },
    {
      title: "User management",
      items: getFilteredUserManagementCategories(
        userManagementCategories,
        showAdminSettings,
        isSuperUser,
      ),
    },
    {
      title: "Instance",
      items: getFilteredInstanceCategories(instanceCategories, isSuperUser),
    },
  ];

  const onCategoryClick = (item: AdminSettingsNavItem) => {
    if (item.slug === "general") {
      dispatch({ type: ReduxActionTypes.FETCH_ADMIN_SETTINGS });
    }

    if (item.isFeatureEnabled === false) {
      const source: Record<string, string> = {
        "audit-logs": "AuditLogs",
        "access-control": "AccessControl",
        provisioning: "Provisioning",
      };

      AnalyticsUtil.logEvent("ADMIN_SETTINGS_CLICK", {
        source: source[item.slug],
      });
    }
  };

  return (
    <AdminSettingsNavigation
      currentCategory={category}
      currentSubCategory={subCategory}
      hrefForCategory={(item, parent) =>
        !parent
          ? adminSettingsCategoryUrl({ category: item.slug })
          : adminSettingsCategoryUrl({
              category: parent.slug,
              selected: item.slug,
            })
      }
      onCategoryClick={onCategoryClick}
      renderBadge={getBadge}
      renderLink={AppsmithRouterLink}
      sections={sections}
    />
  );
}
