import React, { useEffect, useState } from "react";
import { Button, Text } from "@appsmith/ads";
import type { MarketplaceItem, MarketplaceTag } from "../../api/types";
import { ProductPageHeader } from "../../layouts/templates/TemplateCatalogShell";
import { useAppDispatch, useAppSelector } from "../../state/store";
import { loadItem } from "./catalogSlice";
import "./marketplaceItemDetail.css";

/**
 * Adapted from Appsmith's Templates/TemplateView.tsx, TemplateViewHeader.tsx,
 * and Template/TemplateDescription.tsx (Apache-2.0; see repository LICENSE).
 * Item data comes only from the operator_display Java API. The Java item has
 * preview images, so the Appsmith application iframe is a static image frame.
 */

function catalogHref(): string {
  const groupId = new URLSearchParams(window.location.search).get("groupId");

  if (!groupId || !/^[1-9]\d*$/.test(groupId)) return "/marketplace";

  const parsed = Number(groupId);

  return Number.isSafeInteger(parsed)
    ? `/marketplace?groupId=${parsed}`
    : "/marketplace";
}

function availableImages(item: MarketplaceItem): string[] {
  const previews = Array.isArray(item.previewImages)
    ? item.previewImages.filter(
        (url): url is string => typeof url === "string" && url.length > 0,
      )
    : [];

  if (previews.length > 0) return previews;

  return typeof item.thumbnailUrl === "string" && item.thumbnailUrl.length > 0
    ? [item.thumbnailUrl]
    : [];
}

function availableTags(item: MarketplaceItem): MarketplaceTag[] {
  return Array.isArray(item.tags)
    ? item.tags.filter(
        (tag): tag is MarketplaceTag =>
          tag !== null &&
          typeof tag === "object" &&
          typeof tag.id === "number" &&
          typeof tag.name === "string",
      )
    : [];
}

function Preview({ item }: { item: MarketplaceItem }): React.ReactElement {
  const images = availableImages(item);
  const [selectedImage, setSelectedImage] = useState(0);

  useEffect(() => setSelectedImage(0), [item.id]);

  return (
    <section aria-label={`${item.name} preview`} className="marketplace-detail__preview-section">
      <div className="marketplace-detail__browser">
        <div aria-hidden="true" className="marketplace-detail__browser-bar">
          <span className="marketplace-detail__browser-dot marketplace-detail__browser-dot--red" />
          <span className="marketplace-detail__browser-dot marketplace-detail__browser-dot--yellow" />
          <span className="marketplace-detail__browser-dot marketplace-detail__browser-dot--green" />
        </div>
        <div className="marketplace-detail__browser-content">
          {images.length > 0 ? (
            <img alt={`${item.name} preview ${selectedImage + 1}`} src={images[selectedImage] ?? images[0]} />
          ) : (
            <div className="marketplace-detail__preview-empty">
              <span aria-hidden="true">▤</span>
              <Text kind="heading-m" renderAs="p">
                No preview available
              </Text>
            </div>
          )}
        </div>
      </div>
      {images.length > 1 && (
        <div aria-label="Choose a preview image" className="marketplace-detail__thumbnails" role="group">
          {images.map((image, index) => (
            <button
              aria-label={`Show preview ${index + 1}`}
              aria-pressed={selectedImage === index}
              className="marketplace-detail__thumbnail"
              key={`${image}-${index}`}
              onClick={() => setSelectedImage(index)}
              type="button"
            >
              <img alt="" src={image} />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function DetailBody({ item }: { item: MarketplaceItem }): React.ReactElement {
  const tags = availableTags(item);

  return (
    <>
      <div className="marketplace-detail__title-row">
        <a className="marketplace-detail__back" href={catalogHref()}>
          <span aria-hidden="true">←</span> Go back
        </a>
        <Text className="marketplace-detail__title" kind="heading-l" renderAs="h1">
          {item.name}
        </Text>
        <div className="marketplace-detail__title-actions">
          <span className="marketplace-detail__type">{item.type}</span>
          {item.type === "dashboard" && (
            <a className="marketplace-detail__view" href={`/viewer/items/${item.id}`}>
              View dashboard
            </a>
          )}
        </div>
      </div>

      <Preview item={item} />

      <div className="marketplace-detail__description">
        <div className="marketplace-detail__description-column">
          <section className="marketplace-detail__description-section">
            <Text kind="heading-m" renderAs="h2">Overview</Text>
            <Text kind="body-m" renderAs="p">
              {item.description || "No description provided."}
            </Text>
          </section>
          <section className="marketplace-detail__description-section">
            <Text kind="heading-m" renderAs="h2">Type</Text>
            <Text className="marketplace-detail__capitalized" kind="body-m" renderAs="p">
              {item.type}
            </Text>
          </section>
        </div>
        <div className="marketplace-detail__description-column">
          <section className="marketplace-detail__description-section">
            <Text kind="heading-m" renderAs="h2">Publisher</Text>
            <Text kind="body-m" renderAs="p">
              {item.publisherUsername || "Unknown publisher"}
            </Text>
          </section>
          <section className="marketplace-detail__description-section">
            <Text kind="heading-m" renderAs="h2">Downloads</Text>
            <Text kind="body-m" renderAs="p">
              {typeof item.downloadCount === "number" ? item.downloadCount.toLocaleString() : "—"}
            </Text>
          </section>
          {tags.length > 0 && (
            <section className="marketplace-detail__description-section">
              <Text kind="heading-m" renderAs="h2">Tags</Text>
              <ul className="marketplace-detail__tags">
                {tags.map((tag) => <li key={tag.id}>{tag.name}</li>)}
              </ul>
            </section>
          )}
        </div>
      </div>
    </>
  );
}

export function MarketplaceItemDetail({ itemId }: { itemId: number }): React.ReactElement {
  const dispatch = useAppDispatch();
  const sessionStatus = useAppSelector((state) => state.session.status);
  const { detailError, detailItem, detailStatus } = useAppSelector(
    (state) => state.marketplace,
  );

  useEffect(() => {
    if (sessionStatus !== "succeeded") return;

    const request = dispatch(loadItem(itemId));

    return () => request.abort();
  }, [dispatch, itemId, sessionStatus]);

  const item = detailItem?.id === itemId ? detailItem : null;
  const loading = detailStatus === "idle" || detailStatus === "loading" ||
    (detailStatus === "succeeded" && !item);

  return (
    <div className="marketplace-detail">
      <ProductPageHeader active="marketplace" />
      <main aria-busy={loading} className="marketplace-detail__main">
        {loading && (
          <div aria-live="polite" className="marketplace-detail__loading" role="status">
            <div className="marketplace-detail__loading-title" />
            <div className="marketplace-detail__loading-preview" />
            <span>Loading item…</span>
          </div>
        )}
        {detailStatus === "failed" && (
          <div className="marketplace-detail__failure" role="alert">
            <Text kind="heading-m" renderAs="h1">Item unavailable</Text>
            <p>{detailError || "Loading item failed."}</p>
            <div className="marketplace-detail__failure-actions">
              <Button kind="secondary" onClick={() => void dispatch(loadItem(itemId))} size="sm">
                Retry
              </Button>
              <a href={catalogHref()}>Back to marketplace</a>
            </div>
          </div>
        )}
        {detailStatus === "succeeded" && item && <DetailBody item={item} />}
      </main>
    </div>
  );
}
