import React from "react";
import TestRenderer from "react-test-renderer";
import { PublishControls } from "../workspace-entry/PublishControls";

describe("PublishControls", () => {
  const onPublishNew = jest.fn().mockResolvedValue("Uploaded");
  const onReplace = jest.fn().mockResolvedValue("Replaced");

  it("offers only upload for an unlinked local dashboard", () => {
    const renderer = TestRenderer.create(
      <PublishControls itemId={null} onPublishNew={onPublishNew} />,
    );

    const markup = JSON.stringify(renderer.toJSON());

    expect(markup).toContain("t--publish-new");
    expect(markup).not.toContain("t--publish-replace");
    expect(markup).toContain("Upload as new item");
    expect(markup).toContain("Marketplace uploads");
  });

  it("offers replacement when a marketplace item is selected", () => {
    const renderer = TestRenderer.create(
      <PublishControls
        itemId={7}
        onPublishNew={onPublishNew}
        onReplace={onReplace}
      />,
    );

    const markup = JSON.stringify(renderer.toJSON());

    expect(markup).toContain("t--publish-replace");
    const replace = renderer.root.findByProps({
      "data-testid": "t--publish-replace",
    });

    expect(replace.props.children.join("")).toBe("Replace marketplace item #7");
  });
});
