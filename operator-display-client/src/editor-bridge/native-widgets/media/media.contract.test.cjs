const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const ts = require("typescript");

function loadTypeScript(mod, filename) {
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.React,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  mod._compile(output, filename);
}
require.extensions[".ts"] = loadTypeScript;
require.extensions[".tsx"] = loadTypeScript;

const {
  NativeAudioView, NativeDocumentViewerView, NativeVideoView,
  documentIframeSource, getDocViewerConfigs, safeMediaSource,
} = require(path.join(__dirname, "index.ts"));

const pdf = getDocViewerConfigs("https://example.test/manual.pdf?download=1");
assert.deepEqual(pdf, {
  url: "https://example.test/manual.pdf?download=1", viewer: "url", errorMessage: "",
});
assert.equal(documentIframeSource(pdf), pdf.url);

const office = getDocViewerConfigs("https://example.test/report.xlsx");
assert.equal(office.viewer, "office");
assert.equal(documentIframeSource(office),
  "https://view.officeapps.live.com/op/embed.aspx?src=https%3A%2F%2Fexample.test%2Freport.xlsx");

const dropbox = getDocViewerConfigs("https://www.dropbox.com/s/file.pdf?dl=0");
assert.equal(dropbox.url, "https://www.dropbox.com/s/file.pdf?raw=1");
assert.equal(getDocViewerConfigs("https://onedrive.live.com/?cid=abc&id=xyz").url,
  "https://onedrive.live.com/embed?cid=abc&resid=xyz&em=2");
assert.equal(getDocViewerConfigs("https://onedrive.live.com/?cid=abc").viewer, "error");
assert.equal(getDocViewerConfigs("https://example.test/doc.rtf").viewer, "error");
assert.equal(getDocViewerConfigs("/assets/report.docx").viewer, "error");
assert.equal(getDocViewerConfigs("data:application/pdf;base64,JVBERg==").viewer, "url");
assert.equal(getDocViewerConfigs("data:application/vnd.ms-excel;base64,AAAA").viewer, "error");
assert.equal(getDocViewerConfigs("").errorMessage, "No document url provided for viewer");

for (const unsafe of [
  "javascript:alert(1)", "data:text/html,<script>alert(1)</script>", "blob:https://example.test/id",
  "//example.test/media.mp4", "{{MissingWidget.url}}", "/api" + "/v1/assets/file.mp3",
  "../api" + "/v1/assets/file.mp3", "https://read-only-media.invalid/api" + "/v1/assets/file.mp3",
]) {
  assert.equal(safeMediaSource(unsafe, "audio"), undefined, unsafe);
}
assert.equal(safeMediaSource("/assets/track.mp3", "audio"), "/assets/track.mp3");

const documentMarkup = renderToStaticMarkup(React.createElement(NativeDocumentViewerView, {
  docUrl: "https://example.test/manual.pdf", widgetName: "Manual",
}));
assert.match(documentMarkup, /data-native-widget="document-viewer"/);
assert.match(documentMarkup, /title="Manual"/);
assert.match(documentMarkup, /src="https:\/\/example.test\/manual.pdf"/);
assert.doesNotMatch(renderToStaticMarkup(React.createElement(NativeDocumentViewerView, {
  docUrl: "javascript:alert(1)",
})), /<iframe/);

const audio = renderToStaticMarkup(React.createElement(NativeAudioView, {
  url: "https://example.test/track.mp3", widgetName: "Alarm", autoPlay: false,
}));
assert.match(audio, /<audio[^>]*controls=""/);
assert.match(audio, /aria-label="Alarm"/);
assert.match(audio, /data-play-state="NOT_STARTED"/);
assert.match(audio, /controlsList="nofullscreen nodownload noremoteplayback noplaybackrate"/i);
assert.match(audio, /src="https:\/\/example.test\/track.mp3"/);
assert.doesNotMatch(renderToStaticMarkup(React.createElement(NativeAudioView, {
  url: "javascript:alert(1)",
})), /<audio/);

const video = renderToStaticMarkup(React.createElement(NativeVideoView, {
  url: "https://example.test/bird.mp4", autoPlay: true, backgroundColor: "#000",
  borderRadius: "8px", boxShadow: "0 2px 4px #333",
}));
assert.match(video, /<video[^>]*autoplay=""/);
assert.match(video, /muted=""/);
assert.match(video, /disablepictureinpicture=""/);
assert.match(video, /border-radius:8px/);
assert.match(video, /src="https:\/\/example.test\/bird.mp4"/);

console.log("Document Viewer, Audio, and Video bounded renderer contracts passed");
