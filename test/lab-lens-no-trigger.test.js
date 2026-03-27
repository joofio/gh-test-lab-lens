const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { JSDOM } = require("jsdom");

// Load your input data — normal eGFR (70), should not trigger the lens
global.html = fs.readFileSync(path.join(__dirname, "../data/html.html"), "utf-8");
global.epi = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/epi.json")));
global.ips = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/ips-normal-egfr.json")));

// Set up DOM globally so the script can use it
const dom = new JSDOM(global.html);
global.window = dom.window;
global.document = dom.window.document;

let annotation;
beforeAll(() => {
  const scriptContent = fs.readFileSync(path.join(__dirname, "../lab-lens.js"), "utf-8");

  const context = {
    console,
    window,
    document,
    html: global.html,
    epi: global.epi,
    ips: global.ips,
    pv: {},
    require,
    module: {},
    exports: {},
  };

  vm.createContext(context);

  const wrappedScript = `(function() {\n${scriptContent}\n})();`;

  annotation = vm.runInContext(wrappedScript, context);
});

describe("Lab Lens — normal eGFR (no trigger)", () => {
  test("should return version string", () => {
    expect(annotation.getSpecification()).toBe("2.1.0-renal-adjustment-banner");
  });

  test("should return original HTML unchanged when eGFR >= 30", async () => {
    const result = await annotation.enhance();

    // Ensure output directory exists
    const outputDir = path.join(__dirname, "../output");
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir);
    }

    // Save result to file
    const outputPath = path.join(outputDir, "enhanced-no-trigger.html");
    fs.writeFileSync(outputPath, result, "utf-8");

    console.log(`✅ No-trigger HTML saved to: ${outputPath}`);

    // No banner should be injected
    expect(result).not.toContain("lab-alert-banner");
    // No highlight class should be added
    expect(result).not.toContain("lab-lens");
  });
});
