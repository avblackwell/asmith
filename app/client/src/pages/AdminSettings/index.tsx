import React, { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { ReduxActionTypes } from "ee/constants/ReduxActionConstants";
import PageWrapper from "pages/common/PageWrapper";
import { getSettingsLoadingState } from "selectors/settingsSelectors";
import LeftPane from "pages/AdminSettings/LeftPane";
import Main from "pages/AdminSettings/Main";
import { AdminSettingsFrame } from "pages/AdminSettings/SettingsLayout";
import WithSuperUserHOC from "ee/pages/AdminSettings/WithSuperUserHoc";
import { getCurrentUser } from "selectors/usersSelectors";
import bootPylon from "utils/bootPylon";
import { LoaderContainer } from "pages/AdminSettings/components";
import { useParams } from "react-router";
import AdminConfig from "ee/pages/AdminSettings/config";
import { Spinner } from "@appsmith/ads";
import MixpanelSingleton from "../../utils/Analytics/mixpanel";

function Settings() {
  const dispatch = useDispatch();
  const user = useSelector(getCurrentUser);
  const isLoading = useSelector(getSettingsLoadingState);
  // TODO: Fix this the next time the file is edited
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const params = useParams() as any;
  const { category, selected: subCategory } = params;
  const isSavable = AdminConfig.savableCategories.includes(
    subCategory ?? category,
  );

  useEffect(() => {
    // Stop recording this screen
    MixpanelSingleton.getInstance().stopRecording();

    return () => {
      // Start recording after this screen unmounts
      MixpanelSingleton.getInstance().startRecording();
    };
  }, []);

  useEffect(() => {
    if (user?.isSuperUser) {
      dispatch({
        type: ReduxActionTypes.FETCH_ADMIN_SETTINGS,
      });
    }
  }, []);

  useEffect(() => {
    bootPylon(user);
  }, [user?.email]);

  return (
    <PageWrapper isFixed isSavable={isSavable}>
      <AdminSettingsFrame>
        {isLoading ? (
          <LoaderContainer>
            <Spinner size="lg" />
          </LoaderContainer>
        ) : (
          <>
            <LeftPane />
            <Main />
          </>
        )}
      </AdminSettingsFrame>
    </PageWrapper>
  );
}

export default WithSuperUserHOC(Settings);
