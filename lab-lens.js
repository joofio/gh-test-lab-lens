let pvData = pv;
let htmlData = html;

let epiData = epi;
let ipsData = ips;
let lang = "";

let getSpecification = () => {
    return "2.1.0-renal-adjustment-banner";
};

const getExplanation = (lang = "en") => {
    const explanations = {
        en: "This lens highlights sections related to renal dose adjustment when eGFR is low.",
        pt: "Esta lente destaca seções relacionadas ao ajuste da dose renal quando a eGFR está baixa.",
        es: "Esta lente resalta las secciones relacionadas con el ajuste de la dosis renal cuando la eGFR es baja.",
        da: "Denne linse fremhæver afsnit relateret til justering af renal dosis, når eGFR er lav.",
    };
    return explanations[lang] || explanations.en;
};

const getReport = (lang = "en") => {
    return {
        message: getExplanation(lang),
        status: "success",
    };
};

const getLabAlertHTML = (eGFRValue, lang) => {
    let heading = "";
    let body = "";

    if (lang?.startsWith("pt")) {
        heading = "⚠️ Ajuste de Dose Renal Necessário";
        body = `O seu eGFR é ${eGFRValue} mL/min/1.73m². As secções destacadas contêm informação importante sobre dosagem renal.`;
    } else if (lang?.startsWith("es")) {
        heading = "⚠️ Ajuste de Dosis Renal Necesario";
        body = `Su eGFR es ${eGFRValue} mL/min/1.73m². Las secciones resaltadas contienen información importante sobre dosificación renal.`;
    } else if (lang?.startsWith("da")) {
        heading = "⚠️ Nyresdosejustering nødvendig";
        body = `Dit eGFR er ${eGFRValue} mL/min/1.73m². De fremhævede afsnit indeholder vigtig information om nyredosering.`;
    } else {
        heading = "⚠️ Renal Dose Adjustment Needed";
        body = `Your eGFR is ${eGFRValue} mL/min/1.73m². Highlighted sections contain important renal dosing information.`;
    }

    return `
        <div class="lab-alert-banner lab-lens">
            <h3>${heading}</h3>
            <p>${body}</p>
        </div>
        `;
};

const insertLabAlert = (categories, eGFRValue, lang, document, response) => {
    const alertHTML = getLabAlertHTML(eGFRValue, lang);
    let injected = false;

    console.log("[lab-lens] insertLabAlert — target categories:", categories);
    console.log("[lab-lens] html before banner inject (first 200):", document.documentElement.innerHTML.slice(0, 200));

    categories.forEach((className) => {
        const targets = document.getElementsByClassName(className);
        if (targets.length > 0 && !injected) {
            targets[0].insertAdjacentHTML("beforebegin", alertHTML);
            injected = true;
            console.log("[lab-lens] banner injected before class:", className);
        }
    });

    if (!injected) {
        const divs = document.querySelectorAll("body > div");
        const targetDiv = divs[0] || document.querySelector("body") || document.documentElement;
        targetDiv.insertAdjacentHTML("beforebegin", alertHTML);
        console.log("[lab-lens] no target class found — banner injected before div[0]");
    }

    const head = document.getElementsByTagName("head")[0];
    if (head) head.remove();

    const body = document.getElementsByTagName("body")[0];
    console.log("[lab-lens] body exists:", !!body, "| body.innerHTML length:", body?.innerHTML?.length);
    response = body ? body.innerHTML : document.documentElement.innerHTML;
    console.log("[lab-lens] html after banner inject (first 300):", response.slice(0, 300));

    if (!response || response.trim() === "") {
        throw new Error("Lab alert injection failed: empty or null response");
    }

    return response;
};

let annotationProcess = (listOfCategories, enhanceTag, document, response) => {
    listOfCategories.forEach((check) => {
        if (response.includes(check)) {
            let elements = document.getElementsByClassName(check);
            for (let i = 0; i < elements.length; i++) {
                elements[i].classList.add(enhanceTag);
                elements[i].classList.add("lab-lens");
            }
            if (document.getElementsByTagName("head").length > 0) {
                document.getElementsByTagName("head")[0].remove();
            }
            if (document.getElementsByTagName("body").length > 0) {
                response = document.getElementsByTagName("body")[0].innerHTML;
            } else {
                response = document.documentElement.innerHTML;
            }
        }
    });

    if (response == null || response == "") {
        throw new Error(
            "Annotation proccess failed: Returned empty or null response"
        );
    } else {
        return response;
    }
};


let annotateHTMLsection = async (listOfCategories, enhanceTag) => {
    let response = htmlData;
    let document;

    if (typeof window === "undefined") {
        let jsdom = await import("jsdom");
        let { JSDOM } = jsdom;
        let dom = new JSDOM(htmlData);
        document = dom.window.document;
        return annotationProcess(listOfCategories, enhanceTag, document, response);
    } else {
        document = window.document;
        return annotationProcess(listOfCategories, enhanceTag, document, response);
    }
};


let enhance = async () => {
    if (!ipsData || !ipsData.entry || ipsData.entry.length === 0) {
        throw new Error("IPS is empty or invalid.");
    }
    if (!epiData || !epiData.entry || epiData.entry.length === 0) {
        throw new Error("ePI is empty or invalid.");
    }

    // Language detection (CLAUDE.md pattern)
    epiData.entry?.forEach((entry) => {
        const res = entry.resource;
        if (res?.resourceType === "Composition" && res.language) {
            lang = res.language;
        }
    });
    if (!lang && epiData.language) {
        lang = epiData.language;
    }
    if (!lang) {
        lang = "en";
    }
    console.log("[lab-lens] detected language:", lang);

    let enhanceTag = "highlight";
    let triggerHighlight = false;
    let eGFRValue = null;

    const eGFRCodes = ["48643-1", "33914-3", "62238-1"]; // Common LOINC codes for eGFR

    let listOfCategoriesToSearch = [
        { "code": "236423003", "system": "http://snomed.info/sct" },
        { "code": "709044004", "system": "http://snomed.info/sct" }
    ];
    let arrayOfAlertClasses = [
        { "code": "grav-5", "system": "https://www.gravitatehealth.eu/sid/doc" }
    ];

    ipsData.entry.forEach((entry) => {
        if (
            entry.resource &&
            entry.resource.resourceType === "Observation" &&
            entry.resource.code &&
            entry.resource.code.coding &&
            entry.resource.valueQuantity &&
            typeof entry.resource.valueQuantity.value === "number"
        ) {
            const value = entry.resource.valueQuantity.value;
            const isEGFR = entry.resource.code.coding.some(
                (coding) =>
                    eGFRCodes.includes(coding.code) ||
                    (coding.display && coding.display.toLowerCase().includes("egfr"))
            );

            if (isEGFR && value < 30) {
                triggerHighlight = true;
                eGFRValue = value;
                console.log("[lab-lens] eGFR trigger: value =", value);
            }
        }
    });

    if (!triggerHighlight) {
        console.log("[lab-lens] eGFR within normal range — no enhancement applied");
        return htmlData;
    }

    let compositions = 0;
    let highlightCategories = [];
    let alertCategories = [];

    epi.entry.forEach((entry) => {
        if (entry.resource.resourceType == "Composition") {
            compositions++;
            entry.resource.extension.forEach((element) => {
                if (element.extension[1].url == "concept") {
                    if (element.extension[1].valueCodeableReference.concept != undefined) {
                        element.extension[1].valueCodeableReference.concept.coding.forEach(
                            (coding) => {
                                if (listOfCategoriesToSearch.some(
                                    item => item.code === coding.code && item.system === coding.system
                                )) {
                                    highlightCategories.push(element.extension[0].valueString);
                                }
                                if (arrayOfAlertClasses.some(
                                    item => item.code === coding.code && item.system === coding.system
                                )) {
                                    alertCategories.push(element.extension[0].valueString);
                                }
                            }
                        );
                    }
                }
            });
        }
    });

    if (compositions == 0) {
        throw new Error('Bad ePI: no category "Composition" found');
    }

    if (highlightCategories.length == 0 && alertCategories.length == 0) {
        return htmlData;
    }

    console.log("[lab-lens] highlightCategories:", highlightCategories);
    console.log("[lab-lens] alertCategories:", alertCategories);

    // Phase 1: annotate elements with highlight + lab-lens CSS classes
    let annotatedHTML = htmlData;
    if (highlightCategories.length > 0) {
        annotatedHTML = await annotateHTMLsection(highlightCategories, enhanceTag);
    }

    // Phase 2: inject the lab alert banner
    let finalHTML;
    if (typeof window === "undefined") {
        let jsdom = await import("jsdom");
        let { JSDOM } = jsdom;
        let dom = new JSDOM(annotatedHTML);
        let doc = dom.window.document;
        finalHTML = insertLabAlert(alertCategories, eGFRValue, lang, doc, annotatedHTML);
    } else {
        finalHTML = insertLabAlert(alertCategories, eGFRValue, lang, window.document, annotatedHTML);
    }

    return finalHTML;
};

return {
    enhance: enhance,
    getSpecification: getSpecification,
    explanation: (language) => getExplanation(language || lang || "en"),
    report: (language) => getReport(language || lang || "en"),
};
