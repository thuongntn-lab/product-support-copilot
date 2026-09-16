import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildFolderIssues,
  analyzeOriginalNames,
  isIgnoredSystemFile,
  normalizePath,
  proposeNames,
  sanitizeStem
} from "../src/lib/asset-tools.js";
import {
  resolveGmcProductType,
  resolveLarkProductType
} from "../src/lib/product-type-resolver.js";

const liveRuleConfig = JSON.parse(
  readFileSync(
    new URL("../server/config/product-type-rules.json", import.meta.url),
    "utf8"
  )
);
const customallContentScript = readFileSync(
  new URL("../src/content/customall.js", import.meta.url),
  "utf8"
);
const teeinblueContentScript = readFileSync(
  new URL("../src/content/teeinblue.js", import.meta.url),
  "utf8"
);
const backgroundScript = readFileSync(
  new URL("../src/background.js", import.meta.url),
  "utf8"
);
const sidepanelHtml = readFileSync(
  new URL("../src/sidepanel/index.html", import.meta.url),
  "utf8"
);
const sidepanelScript = readFileSync(
  new URL("../src/sidepanel/app.js", import.meta.url),
  "utf8"
);
const shopifyContentScript = readFileSync(
  new URL("../src/content/shopify.js", import.meta.url),
  "utf8"
);
const manifest = JSON.parse(
  readFileSync(new URL("../manifest.json", import.meta.url), "utf8")
);

// MVP4 Shipping ETA survives Shopify's async re-render: marked fields remain
// verifiable, a live field is reacquired, and failed attempts never stay locked.
assert.match(
  shopifyContentScript,
  /findEditableField\(aliases, \{ includeMarked = false \} = \{\}\)/
);
assert.match(
  shopifyContentScript,
  /fillShopifyJsonMetafield[\s\S]*?includeMarked: true[\s\S]*?verifyDeadline[\s\S]*?field\.isConnected/
);
assert.match(
  shopifyContentScript,
  /A failed attempt must never block[\s\S]*?removeAttribute\("data-customall-lark-attempted"\)/
);

// MVP6 Teeinblue label editor scans every layer, immediately applies all literal
// replacements through Vue/React-compatible events, and never clicks Save.
assert.match(sidepanelHtml, /data-tab="tib"/);
assert.match(sidepanelHtml, /id="tib-label-find"[\s\S]*?Quét & đổi Label/);
assert.doesNotMatch(sidepanelHtml, /id="tib-preview-card"/);
assert.match(
  sidepanelScript,
  /SCAN_TIB_LABELS[\s\S]*?state\.tibLabelMatches\.map[\s\S]*?APPLY_TIB_LABELS/
);
assert.match(
  teeinblueContentScript,
  /function tibScanLabels[\s\S]*?tibLabelFields\.set[\s\S]*?function tibApplyLabelChanges/
);
assert.match(
  teeinblueContentScript,
  /tibLayerDescriptors\(\)[\s\S]*?await tibActivateLayer\(layer\)[\s\S]*?tibPersonalizationOptionTitleField\(\)[\s\S]*?await tibActivateLayer\(entry\.layer\)/
);
assert.match(
  teeinblueContentScript,
  /function tibPersonalizationPanel[\s\S]*?Personalization Settings[\s\S]*?function tibOpenPersonalizationSettings[\s\S]*?input\[name="form_label"\]/
);
assert.doesNotMatch(
  teeinblueContentScript.match(/async function tibScanLabels[\s\S]*?\n}/)?.[0] || "",
  /tibEditableFields\(\)/
);
assert.match(
  teeinblueContentScript,
  /\.artwork-sortable-layer[\s\S]*?button#manage-layer[\s\S]*?i\.la-pen[\s\S]*?editButton\.click\(\)/
);
assert.match(
  teeinblueContentScript,
  /new InputEvent\("input"[\s\S]*?props\?\.onChange[\s\S]*?latestProps\?\.onBlur/
);
assert.doesNotMatch(teeinblueContentScript, /\.click\(\)[\s\S]*?save/i);
// MVP6 Smart Setup is additive: discover option values from TeeInBlue Preview,
// validate the mapping first, then batch-apply Conditions without saving.
assert.match(sidepanelHtml, /data-tib-mode="labels"[\s\S]*?data-tib-mode="smart"/);
assert.match(sidepanelHtml, /id="tib-smart-source"[\s\S]*?Exact Match[\s\S]*?Contains/);
assert.match(sidepanelHtml, /VALIDATION & PREVIEW[\s\S]*?Batch Apply Condition/);
assert.match(
  sidepanelScript,
  /SCAN_TIB_SMART_SETUP[\s\S]*?renderTibSmartPreview[\s\S]*?APPLY_TIB_SMART_SETUP/
);
assert.match(
  teeinblueContentScript,
  /function tibSmartSourceOptions[\s\S]*?\.tee-field[\s\S]*?tee-clipart-label[\s\S]*?function tibScanSmartSetup/
);
assert.match(
  teeinblueContentScript,
  /function tibAdditionalOptionSource[\s\S]*?field__additional_option[\s\S]*?field__extra-action \.bg-dark li[\s\S]*?async function tibAdditionalOptionSources/
);
assert.match(
  teeinblueContentScript,
  /async function tibScanSmartSetup[\s\S]*?tibLayerDescriptors\(\)[\s\S]*?tibAdditionalOptionSources\(layers\)[\s\S]*?tibMergeSmartSources/
);
assert.match(
  teeinblueContentScript,
  /async function tibSetConditionValue[\s\S]*?valueMultiselects\.length > 1[\s\S]*?multiselect__tag[\s\S]*?multiselect__option[\s\S]*?radio-image input/
);
assert.match(
  teeinblueContentScript,
  /Always reacquire[\s\S]*?for \(let removal = 0; removal < 40[\s\S]*?values\.length === 1 && values\[0\] === wantedValue/
);
assert.match(
  teeinblueContentScript,
  /async function tibWaitForEditorQuiet[\s\S]*?MutationObserver[\s\S]*?async function tibWaitForConditionValueControl[\s\S]*?radio-image input[\s\S]*?multiselect[\s\S]*?tibSetConditionValue\(block, entry\.option\)/
);
assert.match(
  teeinblueContentScript,
  /function tibSmartMatches[\s\S]*?contains[\s\S]*?async function tibApplySmartSetup/
);
assert.match(
  teeinblueContentScript,
  /tibOpenConditionalSettings[\s\S]*?Add conditions[\s\S]*?tibSelectConditionSource[\s\S]*?tibSetConditionValue/
);
assert.match(
  teeinblueContentScript,
  /tibSelectConditionSource[\s\S]*?multiselect__input[\s\S]*?trigger\.focus\(\)[\s\S]*?tibVisibleConditionOptions[\s\S]*?tibConditionOptionMatches/
);
assert.match(
  teeinblueContentScript,
  /tibSetConditionValue[\s\S]*?Date\.now\(\) \+ 10000/
);
assert.match(teeinblueContentScript, /async function tibWaitFor/);
assert.match(
  teeinblueContentScript,
  /tibSelectConditionSource[\s\S]*?attempt <= 3[\s\S]*?tibConditionSourceMatches/
);
assert.match(
  teeinblueContentScript,
  /Reuse a blank Condition[\s\S]*?!tibConditionSource\(item\)\.title/
);
assert.match(
  teeinblueContentScript,
  /let applied = false[\s\S]*?attempt <= 2[\s\S]*?valueReady[\s\S]*?break/
);
assert.doesNotMatch(
  teeinblueContentScript.match(/async function tibApplySmartSetup[\s\S]*?\n}/)?.[0] || "",
  /Save|save/
);

// Smart Setup 2.0 runs beside the approved v1 workflow. The user chooses the
// AND/OR join before scanning and the exact preview replaces old Conditions.
assert.match(
  sidepanelHtml,
  /data-tib-mode="smart2"[\s\S]*?Smart Setup 2\.0[\s\S]*?id="tib-smart2-join"[\s\S]*?Replace exact[\s\S]*?Apply Condition đã chọn/
);
assert.match(
  sidepanelHtml,
  /id="tib-smart2-primary-source"[\s\S]*?id="tib-smart2-additional-sources"[\s\S]*?id="reload-tib-smart2-sources"/
);
assert.match(
  sidepanelScript,
  /GET_TIB_SMART_SETUP_V2_SOURCES[\s\S]*?renderTibSmart2Sources[\s\S]*?joinMode:[\s\S]*?primarySourceKey:[\s\S]*?additionalSourceKeys:/
);
assert.match(
  teeinblueContentScript,
  /async function tibLayerDescriptors[\s\S]*?const ancestors = \[\][\s\S]*?parentElement\?\.closest\("\.artwork-sortable-layer"\)[\s\S]*?displayLabel: path\.length \?/
);
assert.match(
  teeinblueContentScript,
  /function tibSmartMatchesGroupV2[\s\S]*?optionNumber[\s\S]*?groupNumber[\s\S]*?Number\(optionNumber\) === Number\(groupNumber\)/
);
assert.match(
  teeinblueContentScript,
  /async function tibScanSmartSetupV2\(\{[\s\S]*?primarySourceKey[\s\S]*?additionalSourceKeys[\s\S]*?primarySource\.values\.filter[\s\S]*?layer\.label[\s\S]*?selectedAdditionalSources\.forEach[\s\S]*?layer\.ancestors/
);
assert.match(
  sidepanelScript,
  /SCAN_TIB_SMART_SETUP_V2[\s\S]*?renderTibSmart2Preview[\s\S]*?APPLY_TIB_SMART_SETUP_V2/
);
assert.match(
  teeinblueContentScript,
  /function tibConditionSnapshot[\s\S]*?function tibMergeConditionGroups[\s\S]*?async function tibSetConditionValuesV2/
);
assert.match(
  teeinblueContentScript,
  /async function tibScanSmartSetupV2[\s\S]*?tibMergeSmartSources[\s\S]*?tibConditionSnapshot[\s\S]*?action = !existing\.length[\s\S]*?"new"[\s\S]*?"replace"[\s\S]*?"conflict"/
);
assert.match(
  teeinblueContentScript,
  /async function tibWaitForSmartSourcesV2[\s\S]*?stableCycles[\s\S]*?async function tibReloadPreviewSourcesV2[\s\S]*?reload\s*\\s\+preview[\s\S]*?async function tibAdditionalOptionSourcesV2/
);
assert.match(
  teeinblueContentScript,
  /async function tibScanSmartSetupV2[\s\S]*?await tibReloadPreviewSourcesV2\(\)[\s\S]*?await tibAdditionalOptionSourcesV2\(layers\)/
);
assert.match(
  sidepanelScript,
  /const safe = \["new", "replace"\][\s\S]*?row\.error/
);
assert.doesNotMatch(
  sidepanelScript.match(/function renderTibSmart2Preview[\s\S]*?\n}/)?.[0] || "",
  /tib-smart2-compare|Xem so sánh/
);
assert.match(
  teeinblueContentScript,
  /async function tibApplySmartSetupV2[\s\S]*?existingSignature[\s\S]*?tibRemoveAllConditionBlocks[\s\S]*?tibSetConditionValuesV2[\s\S]*?tibEnsureConditionJoinMode[\s\S]*?TeeInBlue chưa thay thế đúng toàn bộ Final Condition/
);
assert.match(
  teeinblueContentScript,
  /const finalGroups = row\.suggestions\.map[\s\S]*?action = !existing\.length[\s\S]*?"replace"/
);
assert.match(
  teeinblueContentScript,
  /tibConditionGroupsToText[\s\S]*?values = \(group\.values \|\| \[\]\)\.join\(" OR "\)[\s\S]*?parts\.join\(join === "or" \? " OR " : " AND "\)/
);
assert.doesNotMatch(
  teeinblueContentScript.match(/async function tibApplySmartSetupV2[\s\S]*?\n}/)?.[0] || "",
  /Save Artwork|click\(\).*Save/
);
assert.ok(
  manifest.content_scripts.some(
    (entry) =>
      entry.matches?.includes("https://*.teeinblue.com/*") &&
      entry.js?.includes("src/content/teeinblue.js")
  )
);

// MVP7 builds a TeeInBlue Campaign from the current Artwork without touching
// MVP6 behavior. It uses the inspected vgrid selectors and TeeInBlue Dropzone.
assert.match(sidepanelHtml, /data-tab="tib-campaign"/);
assert.match(sidepanelHtml, /id="tib-campaign-title"[\s\S]*?id="tib-campaign-product-hint"/);
assert.match(sidepanelHtml, /MVP7 · TIB Campaign/);
for (const messageType of [
  "GET_TIB_CAMPAIGN_SOURCE",
  "CREATE_TIB_CAMPAIGN_SHELL",
  "PREPARE_TIB_CAMPAIGN_PRODUCT",
  "LINK_TIB_CAMPAIGN_ARTWORK",
  "UPLOAD_TIB_CAMPAIGN_MOCKUPS"
]) {
  assert.ok(sidepanelScript.includes(messageType));
  assert.ok(teeinblueContentScript.includes(messageType));
}
assert.match(
  teeinblueContentScript,
  /\.vgrid-entry-wrapper\[title\][\s\S]*?#imageDropzone[\s\S]*?input\.dz-hidden-input\[type="file"\]/
);
assert.match(
  teeinblueContentScript,
  /tibCreateCampaignShell[\s\S]*?tibWaitFor[\s\S]*?campaign title[\s\S]*?10000/
);
assert.match(
  teeinblueContentScript,
  /tibCreateCampaignShell[\s\S]*?button\.innerText[\s\S]*?Không tìm thấy nút Save Campaign/
);
assert.match(
  teeinblueContentScript,
  /tibProductEntryMatches[\s\S]*?tibFilterRenderedProductEntries[\s\S]*?entry\.style\.display/
);
assert.match(
  teeinblueContentScript,
  /tibPrepareCampaignProduct[\s\S]*?button#select-product-base[\s\S]*?input\.vgrid-input\[placeholder="Search"\][\s\S]*?tibFilterRenderedProductEntries/
);
assert.match(
  teeinblueContentScript,
  /tibPrepareCampaignProduct[\s\S]*?stableSignature[\s\S]*?stablePolls >= 5[\s\S]*?15000, 300[\s\S]*?entries\.length === 1/
);
assert.match(
  teeinblueContentScript,
  /tibPrepareCampaignProduct[\s\S]*?tibWaitForDom\([\s\S]*?tibCampaignHasProductBase\(\)[\s\S]*?6000[\s\S]*?existingProductBase: true[\s\S]*?button#select-product-base/
);
assert.match(
  sidepanelScript,
  /#tib-campaign-mockup-folder[\s\S]*?const validCount = acceptTibCampaignMockups[\s\S]*?if \(validCount\) await prepareTibCampaign\(\)/
);
assert.match(
  teeinblueContentScript,
  /tibReceiveCampaignFiles[\s\S]*?new DataTransfer[\s\S]*?input\.dispatchEvent\(new Event\("change"/
);
assert.match(
  teeinblueContentScript,
  /tibUploadCampaignMockups[\s\S]*?input\.dz-hidden-input\[type="file"\][\s\S]*?\^deselect all\$[\s\S]*?previewCountBefore[\s\S]*?\.dz-preview[\s\S]*?button\[title="Select"\][\s\S]*?selectedCount === count[\s\S]*?buttonCount === count/
);
assert.match(
  teeinblueContentScript,
  /tibUploadCampaignMockups[\s\S]*?Upload\|Assign mockups/
);
assert.match(
  teeinblueContentScript,
  /tibArtworkAction[\s\S]*?querySelectorAll\("body \*"\)[\s\S]*?Select artwork\(\?: for all\)\?[\s\S]*?preferAll[\s\S]*?tibCampaignHasProductBase[\s\S]*?tibArtworkAction\(true\)[\s\S]*?document\.body\?\.innerText[\s\S]*?Available Products[\s\S]*?Print Areas of[\s\S]*?tibLinkCampaignArtwork[\s\S]*?tibWaitForDom\([\s\S]*?tibArtworkAction\(true\)[\s\S]*?15000/
);
assert.match(
  teeinblueContentScript,
  /function tibWaitForDom[\s\S]*?MutationObserver[\s\S]*?attributeFilter[\s\S]*?setInterval\(check, 500\)/
);
assert.match(
  teeinblueContentScript,
  /if \(!entries\?\.length\)[\s\S]*?tibCampaignHasProductBase\(\)[\s\S]*?existingProductBase: true[\s\S]*?Product Base/
);
assert.match(
  sidepanelHtml,
  /id="tib-campaign-mockup-folder"[^>]*webkitdirectory/
);
assert.match(
  sidepanelScript,
  /readTibCampaignSource[\s\S]*?state\.tibCampaignTabId = null[\s\S]*?#tib-campaign-product-hint"\)\.value = response\.productHint \|\| ""/
);
assert.match(
  teeinblueContentScript,
  /tibArtworkCategory[\s\S]*?\^category\\s\*\\\*\?\$[\s\S]*?ant-select-selection-item[\s\S]*?const productHint = category \|\|/
);
assert.match(
  teeinblueContentScript,
  /tibArtworkDetailsDialog[\s\S]*?Artwork details[\s\S]*?tibReadArtworkCategory[\s\S]*?Edit artwork[\s\S]*?tibArtworkCategory[\s\S]*?\^cancel\$/i
);
assert.match(
  teeinblueContentScript,
  /GET_TIB_CAMPAIGN_SOURCE[\s\S]*?tibArtworkCampaignSource\(\)[\s\S]*?\.then\(sendResponse\)[\s\S]*?return true/
);
assert.match(
  sidepanelScript,
  /campaignTopFrameMessages[\s\S]*?CREATE_TIB_CAMPAIGN_SHELL[\s\S]*?resolvedFrameId[\s\S]*?\? 0/
);
assert.match(
  teeinblueContentScript,
  /TIB_RUNTIME_FINGERPRINT = "ps-tib-0\.18\.2-20260914-a"/
);
assert.match(
  teeinblueContentScript,
  /PING_TEEINBLUE_CONTENT[\s\S]*?runtimeFingerprint: TIB_RUNTIME_FINGERPRINT/
);
assert.match(
  sidepanelScript,
/TIB_EXPECTED_RUNTIME_FINGERPRINT = "ps-tib-0\.18\.2-20260914-a"[\s\S]*?response\.runtimeFingerprint === TIB_EXPECTED_RUNTIME_FINGERPRINT/
);
const teeinblueSender = sidepanelScript.match(
  /async function sendTeeinblueMessage[\s\S]*?\n}\n\nfunction setTibMode/
)?.[0] || "";
assert.match(
  teeinblueSender,
  /if \(!framePings\.length && tibFrames\.length\)[\s\S]*?chrome\.scripting\.executeScript[\s\S]*?frameIds: tibFrames\.map/
);
assert.doesNotMatch(
  teeinblueSender,
  /if \(!compatiblePings\.length\)[\s\S]*?chrome\.scripting\.executeScript/
);
assert.ok(
  manifest.web_accessible_resources.some(
    (entry) =>
      entry.resources?.includes("src/bridge/upload-bridge.html") &&
      entry.matches?.includes("https://*.teeinblue.com/*")
  )
);

// MVP5/MVP7 mockup filters accept numbered, Default/DF, Detail and Review files only.
const campaignMockupNamePattern = /^mk-(?:(\d+)(?:-(default|df|detail|review))?|(default|df|detail|review))\.(png|jpe?g|webp)$/i;
for (const name of [
  "MK-1.jpg",
  "MK-002.png",
  "MK-Default.webp",
  "MK-DF.png",
  "MK-1-DF.png",
  "MK-1-df.jpg",
  "MK-default.jpg",
  "MK-Detail.png",
  "MK-detail.jpeg",
  "MK-review.jpg",
  "MK-Review.webp"
]) {
  assert.match(name, campaignMockupNamePattern);
}
for (const name of ["MK-ADS.jpg", "MK-pre.png", "PRE-MK-1.jpg", "MK.jpg"]) {
  assert.doesNotMatch(name, campaignMockupNamePattern);
}
assert.match(
  sidepanelScript,
  /\^mk-\(\?:\(\\d\+\)\(\?:-\(default\|df\|detail\|review\)\)\?\|\(default\|df\|detail\|review\)\)[\s\S]*?sortGroup: suffix === "default" \|\| suffix === "df" \? 0 : numbered \? 1 : 2/
);
assert.match(
  sidepanelScript,
  /function tibCampaignMockups[\s\S]*?\^mk-\(\?:\\d\+\(\?:-\(\?:default\|df\|detail\|review\)\)\?\|default\|df\|detail\|review\)\$\/i/
);
// Gift Box filling must not depend on PAW/WR metafield column placement.
assert.match(backgroundScript, /const linkedId = label\.getAttribute\?\.(?:\("for"\)|\("aria-controls"\))/);
assert.match(backgroundScript, /const container = label\.closest\?\./);
assert.match(backgroundScript, /Math\.hypot\(\(ir\.left \+ ir\.width \/ 2\)/);
assert.match(backgroundScript, /data-metafield-key/);
assert.match(backgroundScript, /compactName\(value\)\.includes\("giftbox"\)/);
assert.match(backgroundScript, /PRODUCT\.metafields\.custom\.giftbox-anchor/);
assert.match(backgroundScript, /aria-labelledby/);

// Regression guard: Customall keeps closed Font/Color popovers mounted but hidden.
// Batch actions must ignore those stale nodes and dismiss all floating panels.
assert.match(
  customallContentScript,
  /function findArtworkFontOverlay\(\)[\s\S]*?\.find\(visible\) \|\| null/
);
assert.match(
  customallContentScript,
  /async function dismissArtworkFloatingPanels\(\)/
);
assert.match(
  customallContentScript,
  /async function applyArtworkTextStyle[\s\S]*?await dismissArtworkFloatingPanels\(\);[\s\S]*?return result;/
);
assert.match(
  customallContentScript,
  /async function applyArtworkTextStyle[\s\S]*?await selectArtworkLayerExclusive\(index\);/
);
// Max font size must be committed in Customall's MAIN world so React Form,
// Redux and the rendered Konva Text node all receive the same value. Keep the
// proven content -> existing background handler architecture.
assert.match(
  backgroundScript,
  /async function setCustomallMaxFontSizeMain[\s\S]*?world: "MAIN"[\s\S]*?input\.blur\(\);[\s\S]*?rectBackedText[\s\S]*?max_font_size[\s\S]*?originActualFontSize/
);
assert.match(
  backgroundScript,
  /commitMountedReactHandlers[\s\S]*?props\?\.onChange\?\.\(reactEvent\)[\s\S]*?blurProps\?\.onBlur\?\./
);
assert.match(
  backgroundScript,
  /document\.execCommand\?\.\("insertText"[\s\S]*?insert-text[\s\S]*?native-events[\s\S]*?react-handler[\s\S]*?commitStrategy \|\| "rejected"/
);
assert.match(
  backgroundScript,
  /if \(!commitStrategy \|\| !matchesExpected\(formValue\)\)[\s\S]*?Never mutate the canvas model before Customall accepts the form[\s\S]*?rectBackedText/
);
assert.doesNotMatch(customallContentScript, /findArtworkLayerSettingsSaveButton/);
assert.match(
  customallContentScript,
  /async function setArtworkFontSize[\s\S]*?SET_CUSTOMALL_MAX_FONT_SIZE_MAIN[\s\S]*?await selectArtworkLayerExclusive\(layerIndex\);[\s\S]*?Math\.abs\(actual - expected\)/
);
// A displayed DOM value is not success: the MAIN-world handler must confirm
// the model, then the content script round-trips another Text layer.
assert.doesNotMatch(customallContentScript, /const fieldAccepted =/);
assert.match(
  customallContentScript,
  /if \(!committed\?\.ok\)[\s\S]*?otherTextLayer[\s\S]*?selectArtworkLayerExclusive\(otherTextLayer\.index\)/
);
assert.match(
  customallContentScript,
  /type: "SET_CUSTOMALL_MAX_FONT_SIZE_MAIN"/
);
const openFontPickerSource = customallContentScript.match(
  /async function openArtworkFontPicker\(\)[\s\S]*?\n}\n\nfunction findFontSearchInput/
)?.[0];
assert.ok(openFontPickerSource);
assert.doesNotMatch(openFontPickerSource, /humanClick\(/);
assert.match(openFontPickerSource, /target\.click\(\)/);
assert.match(
  customallContentScript,
  /async function closeArtworkStrokeAndWait\(\)[\s\S]*?await dismissArtworkFloatingPanels\(\);/
);

// Regression guard: MVP2 exposes one operation at a time and prevents stale
// layer indexes or overlapping batch operations.
assert.equal(
  (sidepanelHtml.match(/data-artwork-tool-panel=/g) || []).length,
  5
);
assert.match(sidepanelScript, /async function preflightArtworkLayers/);
assert.match(sidepanelScript, /function setArtworkBatchBusy/);
assert.match(
  sidepanelScript,
  /getSelectedArtworkLayers\(\{ textOnly: true \}\)/
);
assert.match(sidepanelHtml, /data-artwork-tool="case"/);
assert.match(sidepanelHtml, /data-artwork-tool="label"/);
assert.match(sidepanelHtml, /data-artwork-tool-panel="label"[\s\S]*?id="replace-artwork-labels"/);
assert.match(
  sidepanelScript,
  /async function replaceArtworkLabels[\s\S]*?getSelectedArtworkLayers\(\)[\s\S]*?REPLACE_ARTWORK_LABELS[\s\S]*?occurrence/
);
assert.match(
  customallContentScript,
  /async function commitArtworkLabelTarget[\s\S]*?SET_CUSTOMALL_LABEL_MAIN[\s\S]*?mainCommit\.reactValue[\s\S]*?activeLayerId === expectedLayerId/
);
assert.match(
  backgroundScript,
  /async function setCustomallLabelMain[\s\S]*?world: "MAIN"[\s\S]*?__reactProps[\s\S]*?props\?\.onChange[\s\S]*?reactValue/
);
assert.match(
  backgroundScript,
  /SET_CUSTOMALL_LABEL_MAIN[\s\S]*?setCustomallLabelMain/
);
assert.doesNotMatch(
  sidepanelScript.match(/async function replaceArtworkLabels[\s\S]*?\n}/)?.[0] || "",
  /if \(!replacement\)/
);
assert.match(
  customallContentScript,
  /async function replaceArtworkLabels[\s\S]*?selectedLayers\.forEach[\s\S]*?selected\.occurrence[\s\S]*?seenTargets[\s\S]*?targets\.push/
);
assert.doesNotMatch(
  customallContentScript.match(/async function replaceArtworkLabels[\s\S]*?\n}/)?.[0] || "",
  /requestedIndexes|layerIndexes\.map/
);
assert.match(
  customallContentScript,
  /function getArtworkLayers[\s\S]*?const occurrences = new Map[\s\S]*?occurrence[\s\S]*?function artworkLayerTreeKey/
);
assert.match(
  customallContentScript,
  /target\.type === "Option" \? "#title" : "#personalized_label"[\s\S]*?findArtworkLabelInput\(layer, selector\)/
);
assert.match(
  customallContentScript,
  /async function expandArtworkGroupPath[\s\S]*?waitForArtworkGroupExpanded[\s\S]*?async function openArtworkLabelTarget[\s\S]*?expandArtworkGroupPath\(target\.groupPath\)/
);
assert.match(
  customallContentScript,
  /function findArtworkLabelInput[\s\S]*?visibleInputs\.length === 1[\s\S]*?async function openArtworkLabelTarget[\s\S]*?layer\.header\.getAttribute\("aria-expanded"\) !== "true"/
);
assert.doesNotMatch(
  customallContentScript.match(/async function openArtworkLabelTarget[\s\S]*?\n}/)?.[0] || "",
  /otherExpandedLeaves|layer\.header\.getAttribute\("aria-expanded"\) === "true"/
);
assert.match(
  sidepanelScript,
  /response\.failed\?\.\[0\][\s\S]*?Lỗi:[\s\S]*?response\.noMatch\?\.\[0\][\s\S]*?Không khớp:/
);
assert.match(
  customallContentScript,
  /PING_CUSTOMALL_CONTENT[\s\S]*?chrome\.runtime\.getManifest\(\)\.version/
);
assert.match(
  customallContentScript,
  /item\?\.classList\.contains\("Option"\)[\s\S]*?\? "Option"[\s\S]*?item\?\.classList\.contains\("Group"\)[\s\S]*?\? "Group"/
);
assert.match(
  customallContentScript,
  /function isArtworkGroupHeader[\s\S]*?item\?\.classList\.contains\("Group"\)/
);
assert.match(
  customallContentScript,
  /function getArtworkLayerEntries[\s\S]*?parentGroup[\s\S]*?depth[\s\S]*?parentIndex/
);
assert.match(
  customallContentScript,
  /const layers = getArtworkLayerEntries\(\)\.map[\s\S]*?depth,[\s\S]*?groupPath,[\s\S]*?parentIndex,[\s\S]*?occurrence/
);
assert.match(
  sidepanelScript,
  /artworkSelectedLayerIndexes: new Set\(\)[\s\S]*?artworkCollapsedGroupIndexes: new Set\(\)/
);
assert.match(
  sidepanelScript,
  /function artworkLayerIsHidden[\s\S]*?parentIndex[\s\S]*?artworkCollapsedGroupIndexes/
);
assert.match(
  sidepanelScript,
  /data-artwork-group-toggle[\s\S]*?artworkCollapsedGroupIndexes[\s\S]*?renderArtworkLayers\(\)/
);
assert.match(
  sidepanelScript,
  /function getArtworkDescendantLayers[\s\S]*?parentIndex[\s\S]*?targetIndex[\s\S]*?layer\.type === "Group"[\s\S]*?getArtworkDescendantLayers\(index\)/
);
assert.match(
  sidepanelScript,
  /function syncArtworkSelectionControls[\s\S]*?input\.indeterminate[\s\S]*?selectableLayers[\s\S]*?layer\.type !== "Group"/
);
assert.match(
  sidepanelScript,
  /function getSelectedArtworkLayers[\s\S]*?layer\.type !== "Group"/
);
assert.match(
  customallContentScript,
  /GET_ARTWORK_LAYERS[\s\S]*?expandAllArtworkGroups\(\)[\s\S]*?function isCollapsedArtworkGroupHeader[\s\S]*?function expandAllArtworkGroups/
);
assert.match(
  customallContentScript,
  /async function expandAllArtworkGroups[\s\S]*?async function visitGroup[\s\S]*?visited\.has\(key\)[\s\S]*?childKeys[\s\S]*?await visitGroup/
);
assert.doesNotMatch(
  customallContentScript.match(/async function replaceArtworkLabels[\s\S]*?\n}/)?.[0] || "",
  /expandAllArtworkGroups/
);
assert.doesNotMatch(
  sidepanelScript.match(/async function replaceArtworkLabels[\s\S]*?\n}/)?.[0] || "",
  /preflightArtworkLayers/
);
assert.doesNotMatch(
  customallContentScript.match(/async function replaceArtworkLabels[\s\S]*?\n}/)?.[0] || "",
  /findVisibleButton\(["']Save["']\)|saveButton|\.save\(\)/i
);
assert.match(sidepanelHtml, /id="bulk-change-case"/);
assert.match(sidepanelScript, /type: "APPLY_ARTWORK_CHANGE_CASE"/);
assert.match(
  customallContentScript,
  /async function applyArtworkChangeCase[\s\S]*?await selectArtworkLayerExclusive\(index\);/
);
assert.match(
  customallContentScript,
  /async function setArtworkChangeCase[\s\S]*?await dismissArtworkFloatingPanels\(\);/
);
assert.match(sidepanelHtml, /data-tab="campaign"/);
assert.doesNotMatch(sidepanelHtml, /id="campaign-product-base"/);
assert.doesNotMatch(sidepanelHtml, /id="continue-campaign"/);
assert.match(
  sidepanelScript,
  /type: "SEARCH_CAMPAIGN_PRODUCT_BASES"/
);
assert.match(
  sidepanelScript,
  /type: "SELECT_CAMPAIGN_PRODUCT_BASE"/
);
assert.match(
  sidepanelScript,
  /type: "ARM_CAMPAIGN_PRODUCT_BASE_AUTO_CREATE"/
);
assert.match(sidepanelScript, /type: "GET_CAMPAIGN_EDITOR_STATE"/);
assert.match(
  sidepanelScript,
  /type: "BUILD_CAMPAIGN_FROM_ARTWORK"/
);
assert.match(sidepanelScript, /async function waitForCampaignEditor/);
assert.match(
  customallContentScript,
  /async function getArtworkCampaignSource/
);
assert.match(
  customallContentScript,
  /async function searchCampaignProductBases/
);
assert.match(
  customallContentScript,
  /message\?\.type === "SELECT_CAMPAIGN_PRODUCT_BASE"/
);
assert.match(
  customallContentScript,
  /message\?\.type === "ARM_CAMPAIGN_PRODUCT_BASE_AUTO_CREATE"/
);
assert.match(
  customallContentScript,
  /message\?\.type === "GET_CAMPAIGN_EDITOR_STATE"/
);
assert.match(
  customallContentScript,
  /async function armCampaignProductBaseAutoCreate[\s\S]*?create\.click\(\)/
);
// Single-result auto-select must follow Customall's re-rendered card instead
// of checking the stale card node that was clicked.
assert.match(
  customallContentScript,
  /async function selectCampaignProductBase[\s\S]*?activeModal\.querySelectorAll\("\.ant-card\.selected-card"\)[\s\S]*?ready\.createButton\.click\(\)/
);
assert.match(
  customallContentScript,
  /async function buildCampaignFromArtwork[\s\S]*?const isCampaignEditor = location\.pathname\.startsWith\("\/campaigns\/new"\);[\s\S]*?if \(!isCampaignEditor\)[\s\S]*?await selectCampaignProductBase\(productBaseTitle\);[\s\S]*?await linkCampaignArtwork\(title\);/
);

assert.equal(sanitizeStem(" Golden Retriever (1).PNG "), "golden-retriever-1");
assert.equal(normalizePath("\\Dog\\Husky\\001.PNG"), "Dog/Husky/001.PNG");
assert.equal(isIgnoredSystemFile("Thumbs.db"), true);
assert.equal(isIgnoredSystemFile("desktop.ini"), true);
assert.equal(isIgnoredSystemFile(".DS_Store"), true);
assert.equal(isIgnoredSystemFile("dog.png"), false);

const validFiles = [
  { name: "a.png", webkitRelativePath: "Dogs/Husky/a.png" },
  { name: "b.png", webkitRelativePath: "Dogs/Corgi/b.png" }
];
assert.equal(buildFolderIssues(validFiles).length, 0);

const mixedFiles = [
  { name: "a.png", webkitRelativePath: "Dogs/a.png" },
  { name: "b.png", webkitRelativePath: "Dogs/Husky/b.png" }
];
assert.equal(buildFolderIssues(mixedFiles)[0].code, "MIXED_FOLDER");

const proposals = proposeNames(validFiles);
assert.equal(proposals.get("Dogs/Husky/a.png"), "a.png");

const paddedProposals = proposeNames([
  { name: "skin 1.png", webkitRelativePath: "Dogs/skin 1.png" },
  { name: "skin-12.jpg", webkitRelativePath: "Dogs/skin-12.jpg" },
  { name: "skin 001.png", webkitRelativePath: "Dogs/skin 001.png" }
]);
assert.equal(paddedProposals.get("Dogs/skin 1.png"), "skin 001.png");
assert.equal(paddedProposals.get("Dogs/skin-12.jpg"), "skin 012.jpg");
assert.equal(paddedProposals.get("Dogs/skin 001.png"), "skin 001.png");

const namingRows = [
  { path: "Dogs/A 001.png", folder: "Dogs", file: { name: "A 001.png" } },
  { path: "Dogs/A 001.jpg", folder: "Dogs", file: { name: "A 001.jpg" } },
  { path: "Dogs/c.png", folder: "Dogs", file: { name: "c.png" } }
];
const namingAnalysis = analyzeOriginalNames(namingRows);
assert.equal(namingAnalysis.rowIssues.get("Dogs/A 001.png")[0].code, "DUPLICATE_SEQUENCE");
assert.equal(namingAnalysis.rowIssues.get("Dogs/c.png")[0].code, "MISSING_SEQUENCE");

const validNamingRows = [
  { path: "Dogs/A 001.png", folder: "Dogs", file: { name: "A 001.png" } },
  { path: "Dogs/A 002.png", folder: "Dogs", file: { name: "A 002.png" } }
];
const validNamingAnalysis = analyzeOriginalNames(validNamingRows);
assert.equal(validNamingAnalysis.rowIssues.get("Dogs/A 001.png").length, 0);
assert.equal(validNamingAnalysis.rowIssues.get("Dogs/A 002.png").length, 0);
assert.equal(validNamingAnalysis.folderIssues.length, 0);

const gapAnalysis = analyzeOriginalNames([
  { path: "Dogs/Schnoodle 005.png", folder: "Dogs", file: { name: "Schnoodle 005.png" } },
  { path: "Dogs/Schnoodle 007.png", folder: "Dogs", file: { name: "Schnoodle 007.png" } }
]);
assert.equal(gapAnalysis.folderIssues[0].code, "SEQUENCE_GAP");
assert.match(gapAnalysis.folderIssues[0].message, /006/);

assert.deepEqual(
  resolveLarkProductType("Clothing", ["sale", "Classic-T-Shirt"]),
  {
    ok: true,
    productType: "Classic-T-Shirt",
    source: "tag",
    matches: ["Classic-T-Shirt"]
  }
);
assert.equal(resolveLarkProductType("Poster", ["Classic-T-Shirt"]).productType, "Poster");
assert.equal(resolveLarkProductType("Clothing", ["sale"]).ok, false);
assert.deepEqual(
  resolveLarkProductType("Clothing", [
    "Classic-T-Shirt",
    "Classic-Women-T-Shirt",
    "Classic-Long-Sleeve",
    "Standard-Sweatshirt"
  ]),
  {
    ok: true,
    productType: "Classic-T-Shirt",
    source: "tag_preference",
    matches: [
      "Classic-T-Shirt",
      "Classic-Women-T-Shirt",
      "Classic-Long-Sleeve",
      "Standard-Sweatshirt"
    ]
  }
);
assert.equal(
  resolveLarkProductType("Clothing", ["Classic-Hoodie", "Premium-T-Shirt"]).ok,
  false
);
assert.equal(
  resolveLarkProductType("Mug", []).productType,
  "White mug"
);
assert.equal(
  resolveLarkProductType("Mug", []).source,
  "mapping"
);
assert.equal(
  resolveLarkProductType("Tumbler", []).productType,
  "Tumbler 20oz"
);
assert.equal(resolveGmcProductType("Christmas Ornament"), "Ornament");
assert.equal(resolveGmcProductType("Wooden Ornament"), "Ornament");
assert.equal(resolveGmcProductType("Ornaments"), "Ornament");
assert.equal(resolveGmcProductType("Car Ornament"), "Car Ornament");
assert.equal(resolveGmcProductType("Acrylic Car Ornament"), "Ornament");
assert.equal(resolveGmcProductType("Tumbler"), "Tumbler");
assert.equal(
  resolveGmcProductType("Custom Keepsake", {
    gmcFallbackContainsMappings: [
      { contains: "keepsake", productType: "Ornament" }
    ]
  }),
  "Ornament"
);
assert.equal(
  resolveLarkProductType("Cup", [], {
    shippingDirectMap: { cup: "White mug" },
    clothingProductTypes: []
  }).productType,
  "White mug"
);
assert.equal(
  resolveGmcProductType("Christmas Ornament", liveRuleConfig),
  "Ornament"
);
assert.equal(
  resolveLarkProductType("Tumbler", [], liveRuleConfig).productType,
  "Tumbler 20oz"
);

console.log("logic tests passed");
