import { HttpError } from "./runtime-utils.js";

export const UI_BASE = Object.freeze({
  chat: "Chat",
  products: "Products",
  settings: "Settings",
  newChat: "New chat",
  workspace: "Workspace",
  aiMode: "AI mode",
  autoMode: "Auto fallback",
  providers: "Providers",
  chatHistory: "Chat history",
  sideBySide: "Side by side",
  combinedAnswer: "Combined answer",
  crossCritique: "Cross-critique",
  howHelp: "How can I help?",
  messageUnit369: "Message Unit369",
  send: "Send",
  copy: "Copy",
  thinking: "Thinking…",
  aiTeamDetails: "AI Team details",
  integrations: "Integrations",
  refresh: "Refresh",
  connected: "Connected",
  notConnected: "Not connected",
  application: "Application",
  applicationLanguage: "Application language",
  automatic: "Automatic",
  custom: "Custom",
  compactInterface: "Compact interface",
  aiModels: "AI models",
  serverDefault: "Server default",
  version: "Version",
  name: "Name",
  price: "Price",
  sizes: "Sizes",
  description: "Description",
  status: "Status",
  draft: "Draft",
  active: "Active",
  sku: "SKU",
  type: "Type",
  vendor: "Vendor",
  tags: "Tags",
  images: "Images",
  video: "Video",
  reviewProduct: "Review product",
  confirmSave: "Confirm & save",
  edit: "Edit",
  saving: "Saving…",
  productSaved: "Product saved.",
  finalPreview: "Final preview",
  productIntro: "Create and review products before saving.",
  settingsIntro: "Application, language and connection settings.",
  aiPrepareDraft: "AI prepare draft",
  preparing: "Preparing…",
  aiDraftPrepared: "AI draft prepared. Review every field before saving.",
  addProductFirst: "Add a product name or rough notes first.",
  requiredFields: "Name, valid price and at least one size are required.",
  publishImmediately: "This product will be published immediately. Continue?",
  noHistory: "No conversations yet.",
  noAnswer: "No answer available.",
  retry: "Try again",
  offline: "Offline — server actions are unavailable until connection returns.",
  resetPreferences: "Reset local preferences",
  modelsNote:
    "Optional overrides for team modes. Leave blank to use server defaults.",
  languageName: "Language name / BCP-47",
  productList: "Recent products",
  loadProducts: "Load products",
  emptyProducts: "No products found.",
  openMenu: "Open menu",
  signInRequired: "Sign in with Google to use Unit369 AI and products.",
  translationSignInRequired:
    "Sign in with Google to translate the interface into this language.",
  requestFailed: "The request failed. Try again.",
  requestTimeout:
    "The model took too long to answer. Unit369 stopped waiting safely; try again.",
  requestInterrupted:
    "The previous request was interrupted. Please send it again.",
  codeCommandHint:
    "To execute isolated code, send /run python, /run javascript or /run typescript, then put the code on the next line.",
  codeApprovalTitle: "Isolated code execution",
  codeApprovalRequired:
    "Review the execution details. Nothing runs until you approve it.",
  codeLanguage: "Language",
  codeTimeout: "Time limit",
  codeFingerprint: "Code fingerprint",
  codeSize: "Code size",
  codeApprove: "Approve and run",
  codeCancel: "Cancel",
  codeCancelling: "Cancelling approval…",
  codeRunning: "Running in an isolated sandbox…",
  codeCompleted: "Execution completed.",
  codeFailed: "Execution failed.",
  codeCancelled: "Execution was cancelled. No code was run.",
  codeApprovalExpired:
    "This approval is no longer available. Send the command again to create a new one.",
  codeUnknown:
    "The connection ended before the result was confirmed. Unit369 will not run it again automatically.",
  codeOutput: "Standard output",
  codeErrors: "Standard error",
  codeResult: "Result",
  codeNoOutput: "The code completed without text output.",
  codeCopyOutput: "Copy output",
  codeCancelFailed:
    "Cancellation could not be confirmed. This approval was removed from this device and cannot be run here.",
  codeStatusApproval: "Awaiting approval",
  codeStatusCancelling: "Cancelling",
  codeStatusRunning: "Running",
  codeStatusCompleted: "Completed",
  codeStatusFailed: "Failed",
  codeStatusCancelled: "Cancelled",
  codeStatusExpired: "Expired",
  codeStatusUnknown: "Unknown",
  projectAttach: "Attach files",
  projectFilesReady: "Project files selected",
  projectClearFiles: "Remove files",
  projectFileLimits:
    "Select up to 20 UTF-8 text files, 128 KiB each and 512 KiB total.",
  projectApprovalTitle: "Project execution",
  projectApprovalRequired:
    "Review the workspace, files and operation. Nothing runs until you approve it.",
  projectWorkspace: "Workspace",
  projectOperation: "Operation",
  projectFiles: "Files",
  projectSize: "Source size",
  projectArtifacts: "Output files",
  projectDownload: "Download",
  projectImporting: "Saving project files…",
  projectRunning: "Running the approved project…",
  projectCompleted: "Project execution completed.",
  projectFailed: "Project execution failed.",
  projectCancelled: "Project execution was cancelled. No project file was run.",
  projectApprovalExpired:
    "This project approval is no longer available. Attach the files again to create a new one.",
  projectUnknown:
    "The connection ended before the project result was confirmed. Unit369 will not run it again automatically.",
  dataFilesReady: "Data files selected",
  dataFileLimits:
    "Data Lab accepts up to 5 CSV, TSV, JSON or XLSX files, 1 MiB each and 3 MiB total.",
  dataApprovalTitle: "Unit369 Data Lab",
  dataApprovalRequired:
    "Review the dataset and operation. Analysis starts only after you approve it.",
  dataDataset: "Dataset",
  dataOperation: "Analysis",
  dataImporting: "Saving data files…",
  dataRunning: "Running the approved Data Lab analysis…",
  dataCompleted: "Data Lab analysis completed.",
  dataFailed: "Data Lab analysis failed.",
  dataCancelled: "Data Lab analysis was cancelled. No analysis was run.",
  dataApprovalExpired:
    "This Data Lab approval is no longer available. Attach the files again to create a new one.",
  dataUnknown:
    "The connection ended before the Data Lab result was confirmed. Unit369 will not run it again automatically.",
  dataRows: "Rows",
  dataColumns: "Columns",
  dataPreview: "Data preview",
  dataStatistics: "Column statistics",
  dataMissing: "Missing",
  dataUnique: "Unique",
  dataMean: "Mean",
  dataMinimum: "Minimum",
  dataMaximum: "Maximum",
  dataCleaning: "Cleaning result",
  dataDuplicatesRemoved: "Duplicate rows removed",
  dataEmptyRowsRemoved: "Empty rows removed",
  dataFormulasNeutralized: "Spreadsheet formulas neutralized",
  dataChart: "Generated chart",
  dataPrediction: "Prediction evaluation",
  dataTarget: "Target column",
  dataPredictionType: "Prediction type",
  dataModel: "Model",
  dataBaseline: "Baseline",
  dataMetrics: "Test-set metrics",
  dataFeatures: "Features used",
  dataTrainRows: "Training rows",
  dataTestRows: "Test rows",
  dataExploratoryNote:
    "Exploratory result only. Verify data quality and domain fit before using it for decisions.",
  dataPredictionTargetRequired:
    'Name the target column in quotes, for example: Predict "sales".',
  dataOperationProfile: "Profile and summarize",
  dataOperationClean: "Clean and export",
  dataOperationChart: "Create a chart",
  dataOperationPredict: "Evaluate a prediction",
});

const UI_SR = Object.freeze({
  chat: "Razgovor",
  products: "Proizvodi",
  settings: "Podešavanja",
  newChat: "Novi razgovor",
  workspace: "Radni prostor",
  aiMode: "AI režim",
  autoMode: "Automatska rezerva",
  providers: "AI provajderi",
  chatHistory: "Istorija razgovora",
  sideBySide: "Jedan pored drugog",
  combinedAnswer: "Objedinjeni odgovor",
  crossCritique: "Unakrsna kritika",
  howHelp: "Kako mogu da pomognem?",
  messageUnit369: "Napišite poruku za Unit369",
  send: "Pošalji",
  copy: "Kopiraj",
  thinking: "Razmišljam…",
  aiTeamDetails: "Detalji AI tima",
  integrations: "Integracije",
  refresh: "Osveži",
  connected: "Povezano",
  notConnected: "Nije povezano",
  application: "Aplikacija",
  applicationLanguage: "Jezik aplikacije",
  automatic: "Automatski",
  custom: "Prilagođeno",
  compactInterface: "Kompaktan prikaz",
  aiModels: "AI modeli",
  serverDefault: "Podrazumevano na serveru",
  version: "Verzija",
  name: "Naziv",
  price: "Cena",
  sizes: "Veličine",
  description: "Opis",
  status: "Status",
  draft: "Nacrt",
  active: "Aktivan",
  sku: "SKU",
  type: "Vrsta",
  vendor: "Proizvođač",
  tags: "Oznake",
  images: "Slike",
  video: "Video",
  reviewProduct: "Pregledaj proizvod",
  confirmSave: "Potvrdi i sačuvaj",
  edit: "Izmeni",
  saving: "Čuvam…",
  productSaved: "Proizvod je sačuvan.",
  finalPreview: "Završni pregled",
  productIntro: "Napravite i pregledajte proizvod pre čuvanja.",
  settingsIntro: "Podešavanja aplikacije, jezika i povezivanja.",
  aiPrepareDraft: "AI priprema nacrta",
  preparing: "Pripremam…",
  aiDraftPrepared:
    "AI nacrt je pripremljen. Proverite svako polje pre čuvanja.",
  addProductFirst: "Prvo unesite naziv proizvoda ili kratke beleške.",
  requiredFields: "Obavezni su naziv, ispravna cena i najmanje jedna veličina.",
  publishImmediately:
    "Ovaj proizvod će odmah biti objavljen. Da li želite da nastavite?",
  noHistory: "Još nema razgovora.",
  noAnswer: "Odgovor nije dostupan.",
  retry: "Pokušaj ponovo",
  offline:
    "Nema veze sa internetom — serverske funkcije trenutno nisu dostupne.",
  resetPreferences: "Vrati početna podešavanja",
  modelsNote:
    "Opcione izmene za timske režime. Ostavite prazno za podrazumevani model servera.",
  languageName: "Oznaka jezika / BCP-47",
  productList: "Nedavni proizvodi",
  loadProducts: "Učitaj proizvode",
  emptyProducts: "Nema pronađenih proizvoda.",
  openMenu: "Otvori meni",
  signInRequired:
    "Prijavite se Google nalogom da biste koristili Unit369 AI i proizvode.",
  translationSignInRequired:
    "Prijavite se Google nalogom da biste preveli interfejs na ovaj jezik.",
  requestFailed: "Zahtev nije uspeo. Pokušajte ponovo.",
  requestTimeout:
    "Modelu je trebalo predugo da odgovori. Unit369 je bezbedno prekinuo čekanje; pokušajte ponovo.",
  requestInterrupted: "Prethodni zahtev je prekinut. Pošaljite ga ponovo.",
  codeCommandHint:
    "Za izvršavanje izolovanog koda pošaljite /run python, /run javascript ili /run typescript, pa u sledećem redu unesite kod.",
  codeApprovalTitle: "Izolovano izvršavanje koda",
  codeApprovalRequired:
    "Pregledajte detalje izvršavanja. Ništa se ne pokreće dok ne odobrite.",
  codeLanguage: "Jezik",
  codeTimeout: "Vremensko ograničenje",
  codeFingerprint: "Otisak koda",
  codeSize: "Veličina koda",
  codeApprove: "Odobri i pokreni",
  codeCancel: "Otkaži",
  codeCancelling: "Otkazujem odobrenje…",
  codeRunning: "Izvršavam u izolovanom sandboksu…",
  codeCompleted: "Izvršavanje je završeno.",
  codeFailed: "Izvršavanje nije uspelo.",
  codeCancelled: "Izvršavanje je otkazano. Kod nije pokrenut.",
  codeApprovalExpired:
    "Ovo odobrenje više nije dostupno. Ponovo pošaljite komandu da napravite novo.",
  codeUnknown:
    "Veza je prekinuta pre potvrde rezultata. Unit369 neće automatski ponovo pokrenuti kod.",
  codeOutput: "Standardni izlaz",
  codeErrors: "Standardna greška",
  codeResult: "Rezultat",
  codeNoOutput: "Kod je završen bez tekstualnog izlaza.",
  codeCopyOutput: "Kopiraj izlaz",
  codeCancelFailed:
    "Otkazivanje nije potvrđeno. Odobrenje je uklonjeno sa ovog uređaja i odavde više ne može da se pokrene.",
  codeStatusApproval: "Čeka odobrenje",
  codeStatusCancelling: "Otkazujem",
  codeStatusRunning: "Izvršavam",
  codeStatusCompleted: "Završeno",
  codeStatusFailed: "Neuspešno",
  codeStatusCancelled: "Otkazano",
  codeStatusExpired: "Isteklo",
  codeStatusUnknown: "Nepoznato",
  projectAttach: "Dodaj fajlove",
  projectFilesReady: "Fajlovi projekta su izabrani",
  projectClearFiles: "Ukloni fajlove",
  projectFileLimits:
    "Izaberite najviše 20 UTF-8 tekstualnih fajlova, do 128 KiB po fajlu i 512 KiB ukupno.",
  projectApprovalTitle: "Izvršavanje projekta",
  projectApprovalRequired:
    "Pregledajte radni prostor, fajlove i operaciju. Ništa se ne pokreće dok ne odobrite.",
  projectWorkspace: "Radni prostor",
  projectOperation: "Operacija",
  projectFiles: "Fajlovi",
  projectSize: "Veličina izvora",
  projectArtifacts: "Izlazni fajlovi",
  projectDownload: "Preuzmi",
  projectImporting: "Čuvam fajlove projekta…",
  projectRunning: "Pokrećem odobreni projekat…",
  projectCompleted: "Izvršavanje projekta je završeno.",
  projectFailed: "Izvršavanje projekta nije uspelo.",
  projectCancelled:
    "Izvršavanje projekta je otkazano. Nijedan fajl projekta nije pokrenut.",
  projectApprovalExpired:
    "Odobrenje projekta više nije dostupno. Ponovo dodajte fajlove da biste napravili novo.",
  projectUnknown:
    "Veza je prekinuta pre potvrde rezultata projekta. Unit369 ga neće automatski ponovo pokrenuti.",
  dataFilesReady: "Fajlovi sa podacima su izabrani",
  dataFileLimits:
    "Data Lab prihvata najviše 5 CSV, TSV, JSON ili XLSX fajlova, do 1 MiB po fajlu i 3 MiB ukupno.",
  dataApprovalTitle: "Unit369 Data Lab",
  dataApprovalRequired:
    "Pregledajte skup podataka i operaciju. Analiza počinje tek kada je odobrite.",
  dataDataset: "Skup podataka",
  dataOperation: "Analiza",
  dataImporting: "Čuvam fajlove sa podacima…",
  dataRunning: "Pokrećem odobrenu Data Lab analizu…",
  dataCompleted: "Data Lab analiza je završena.",
  dataFailed: "Data Lab analiza nije uspela.",
  dataCancelled: "Data Lab analiza je otkazana. Analiza nije pokrenuta.",
  dataApprovalExpired:
    "Data Lab odobrenje više nije dostupno. Ponovo dodajte fajlove da biste napravili novo.",
  dataUnknown:
    "Veza je prekinuta pre potvrde Data Lab rezultata. Unit369 neće automatski ponovo pokrenuti analizu.",
  dataRows: "Redovi",
  dataColumns: "Kolone",
  dataPreview: "Pregled podataka",
  dataStatistics: "Statistika kolona",
  dataMissing: "Nedostaje",
  dataUnique: "Jedinstveno",
  dataMean: "Prosek",
  dataMinimum: "Minimum",
  dataMaximum: "Maksimum",
  dataCleaning: "Rezultat čišćenja",
  dataDuplicatesRemoved: "Uklonjeni duplirani redovi",
  dataEmptyRowsRemoved: "Uklonjeni prazni redovi",
  dataFormulasNeutralized: "Neutralisane formule u tabeli",
  dataChart: "Napravljen grafikon",
  dataPrediction: "Provera predikcije",
  dataTarget: "Ciljna kolona",
  dataPredictionType: "Vrsta predikcije",
  dataModel: "Model",
  dataBaseline: "Osnovno poređenje",
  dataMetrics: "Metrike na test skupu",
  dataFeatures: "Korišćene osobine",
  dataTrainRows: "Redovi za obuku",
  dataTestRows: "Redovi za test",
  dataExploratoryNote:
    "Rezultat je istraživački. Proverite kvalitet podataka i prikladnost za oblast pre donošenja odluka.",
  dataPredictionTargetRequired:
    'Navedite ciljnu kolonu u navodnicima, na primer: Predvidi "prodaja".',
  dataOperationProfile: "Profil i sažetak",
  dataOperationClean: "Čišćenje i izvoz",
  dataOperationChart: "Pravljenje grafikona",
  dataOperationPredict: "Provera predikcije",
});

export function normalizeLanguage(value) {
  const raw = String(value || "en").trim();
  if (!/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,3}$/.test(raw)) {
    throw new HttpError(
      400,
      "Language must be a valid BCP-47 code.",
      "invalid_language",
    );
  }
  try {
    return Intl.getCanonicalLocales(raw)[0] || "en";
  } catch {
    throw new HttpError(
      400,
      "Language must be a valid BCP-47 code.",
      "invalid_language",
    );
  }
}

export function staticTranslation(language) {
  const base = language.toLowerCase().split("-")[0];
  if (base === "en") return UI_BASE;
  if (base === "sr") return UI_SR;
  return null;
}

export function validateTranslation(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(
      502,
      "Translation provider returned an invalid dictionary.",
      "invalid_translation",
    );
  }
  const translated = {};
  for (const key of Object.keys(UI_BASE)) {
    const text = value[key];
    if (typeof text !== "string" || !text.trim() || text.length > 500) {
      throw new HttpError(
        502,
        `Translation is missing key: ${key}.`,
        "invalid_translation",
      );
    }
    translated[key] = text.trim();
  }
  return translated;
}
