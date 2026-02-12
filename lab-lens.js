let pvData = pv;
let htmlData = html;

let epiData = epi;
let ipsData = ips;
let lang = "";

let getSpecification = () => {
    return "2.0.0-renal-adjustment";
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
}


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

    let enhanceTag = "highlight";
    let triggerHighlight = false;

    // Define logic: if eGFR < 30 → highlight <renal dose adjustment> - should work for every drug, since they have the class
    const eGFRCodes = ["48643-1", "33914-3", "62238-1"]; // Common LOINC codes for eGFR - what to look in the IPS

    let listOfCategoriesToSearch = [{ "code": "236423003", "system": "http://snomed.info/sct" }, { "code": "709044004", "system": "http://snomed.info/sct" }]; //what to look in extensions -made up code because there is none

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
            }
        }
    });

    if (!triggerHighlight) {
        return htmlData;
    }

    // ePI traslation from terminology codes to their human redable translations in the sections
    let compositions = 0;
    let categories = [];
    epi.entry.forEach((entry) => {
        if (entry.resource.resourceType == "Composition") {
            compositions++;
            //Iterated through the Condition element searching for conditions
            entry.resource.extension.forEach((element) => {

                // Check if the position of the extension[1] is correct
                if (element.extension[1].url == "concept") {
                    // Search through the different terminologies that may be avaible to check in the condition
                    if (element.extension[1].valueCodeableReference.concept != undefined) {
                        element.extension[1].valueCodeableReference.concept.coding.forEach(
                            (coding) => {
                                // Check if the code is in the list of categories to search
                                if (listOfCategoriesToSearch.some(item => item.code === coding.code && item.system === coding.system)) {
                                    // Check if the category is already in the list of categories
                                    categories.push(element.extension[0].valueString);
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
    if (categories.length == 0) {
        return htmlData;
    }
    return await annotateHTMLsection(categories, enhanceTag);
};

return {
    enhance: enhance,
    getSpecification: getSpecification,
    explanation: (language) => getExplanation(language || lang || "en"),
    report: (language) => getReport(language || lang || "en"),
};
