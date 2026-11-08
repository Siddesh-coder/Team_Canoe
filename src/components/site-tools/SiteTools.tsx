import { useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Moon, Send, Sun, X } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { askCanoe, chatInput } from "@/lib/chat/chat.functions";
import type { AgentRole, ChatTurn, TrackingStatus } from "@/lib/chat/types";
import { ClaimStatusCard } from "./ClaimStatusCard";
import { ChatBoatMark } from "./ChatBoatMark";
import { Link } from "@tanstack/react-router";
import type { getCustomerStatus } from "@/lib/customer/status";
import { SiteToolsContext } from "./site-tools-context";

export type Locale = "en" | "de";
export type Theme = "light" | "dark";

const localeStorageKey = "canoe-locale";
const themeStorageKey = "canoe-theme";

const copy = {
  en: {
    language: "Language", theme: "Switch to dark mode", light: "Switch to light mode", chat: "Canoe help",
    open: "Open Ask Canoe help chat", close: "Close chat", hello: "Hello! I can explain Canoe’s policy, help prepare a claim, or track a demo reference. Please don’t share personal details here.",
    prompt: "Ask a question…", send: "Send message", topics: ["Where is my claim?", "What documents do I need?", "Explain human review"],
    role: "Assistant role", roles: ["Policy Guide", "Claims Support", "Document Guide"], thinking: "Canoe is responding…", retry: "Retry", error: "Canoe is unavailable right now. Please try again.",
  },
  de: {
    language: "Sprache", theme: "Dunkelmodus einschalten", light: "Hellmodus einschalten", chat: "Canoe Hilfe",
    open: "Ask-Canoe-Hilfe öffnen", close: "Chat schließen", hello: "Hallo! Ich erkläre Canoes Policy, helfe bei der Schadenmeldung oder prüfe eine Demoreferenz. Bitte teilen Sie hier keine persönlichen Daten.",
    prompt: "Frage eingeben…", send: "Nachricht senden", topics: ["Wo ist meine Schadenmeldung?", "Welche Unterlagen brauche ich?", "Menschliche Prüfung erklären"],
    role: "Assistentenrolle", roles: ["Policy-Hilfe", "Schadenhilfe", "Dokumentenhilfe"], thinking: "Canoe antwortet…", retry: "Erneut versuchen", error: "Canoe ist gerade nicht erreichbar. Bitte versuchen Sie es erneut.",
  },
} as const;

const translations: Record<string, string> = {
  "Track a claim": "Schaden verfolgen", "Track your": "Verfolgen Sie Ihren", "claim": "Schaden", "Track your claim": "Schaden verfolgen", "Claim number": "Schadensnummer", "Your recent claims": "Ihre letzten Schadenmeldungen", "Your claim": "Ihre Schadenmeldung", "It's on its": "Ihre Meldung ist auf dem", "way": "Weg", "Copy claim number": "Schadensnummer kopieren", "Copied": "Kopiert", "Please copy your claim number.": "Bitte kopieren Sie Ihre Schadensnummer.",
  "Received": "Eingegangen", "Being checked": "Wird geprüft", "We need something": "Angaben fehlen", "With a specialist": "Bei Fachperson", "Decided": "Abgeschlossen", "What happens next": "Wie es weitergeht", "Checking your claim…": "Ihre Schadenmeldung wird abgerufen …", "We can't find that claim number. Check your confirmation email.": "Wir finden diese Schadensnummer nicht. Prüfen Sie Ihre Bestätigungsmail.", "Claim status is unavailable. Please try again.": "Der Schadenstatus ist gerade nicht erreichbar. Bitte versuchen Sie es erneut.", "No information is requested right now.": "Aktuell werden keine weiteren Angaben benötigt.",
  "Your claim is received.": "Ihre Schadenmeldung ist eingegangen.", "We'll be in touch.": "Wir melden uns bei Ihnen.", "Everything is complete. It's moving to normal handling.": "Alles ist vollständig. Ihre Meldung geht in die reguläre Bearbeitung.", "No payment is approved yet - your insurer will be in touch.": "Noch ist keine Zahlung genehmigt – Ihr Versicherer meldet sich bei Ihnen.", "We need one thing from you": "Wir brauchen noch etwas von Ihnen", "A specialist is looking at your claim. We'll contact you.": "Eine Fachperson prüft Ihre Schadenmeldung. Wir melden uns bei Ihnen.", "Approved for normal processing.": "Für die reguläre Bearbeitung freigegeben.", "Closed - we've written to you.": "Abgeschlossen – wir haben Ihnen geschrieben.", "Closed.": "Abgeschlossen.", "Your update is being checked.": "Ihre Ergänzung wird geprüft.", "Add it now": "Jetzt ergänzen", "We need:": "Wir benötigen:",
  "incident report": "Unfallbericht", "itemized repair quote": "detaillierter Kostenvoranschlag", "repair amount": "Reparaturbetrag", "additional information": "weitere Angaben", "what happened": "Schadenhergang", "repair type": "Reparaturart", "injury information": "Angaben zu Verletzungen", "other party information": "Angaben zu Beteiligten", "Claim received": "Schadenmeldung eingegangen", "A specialist picked it up": "Eine Fachperson hat die Bearbeitung übernommen", "Reminders are simulated in this prototype.": "Erinnerungen werden in diesem Prototyp simuliert.", "Demo time": "Demozeit", "1 day = 10 seconds": "1 Tag = 10 Sekunden", "Reminder": "Erinnerung", "of 3 sent": "von 3 gesendet", "next on": "nächste am", "A reviewer call is due (simulated).": "Ein Anruf der Sachbearbeitung ist fällig (simuliert).", "Reviewer call handover due (simulated)": "Übergabe für Rückruf fällig (simuliert)",
  "Page not found": "Seite nicht gefunden", "The page you're looking for doesn't exist or has been moved.": "Die gesuchte Seite existiert nicht oder wurde verschoben.", "Go home": "Zur Startseite", "This page didn't load": "Diese Seite konnte nicht geladen werden", "Something went wrong on our end. You can try refreshing or head back home.": "Es ist ein Fehler aufgetreten. Laden Sie die Seite neu oder gehen Sie zurück zur Startseite.", "Try again": "Erneut versuchen",
  "Canoe / report a claim / about five minutes": "Canoe / Schaden melden / etwa fünf Minuten", "What happened?": "Was ist passiert?", "Pick what your claim is about. We collect the facts. We never decide the claim.": "Wählen Sie aus, worum es bei Ihrem Schaden geht. Wir erfassen die Fakten, entscheiden aber nicht über den Schaden.", "Choose one": "Bitte auswählen", "My car": "Mein Auto", "My": "Mein", "car": "Auto", "My home": "Mein Zuhause", "My health": "Meine Gesundheit", "start →": "Start →", "preview": "Vorschau", "Have a quote or police report? Keep it close. It saves you questions.": "Halten Sie Kostenvoranschlag oder Polizeibericht bereit. So beantworten Sie weniger Fragen.", "Have your repair quote or police report?": "Haben Sie einen Kostenvoranschlag oder Polizeibericht?", "Add them and we'll fill in what we can - fewer questions for you.": "Fügen Sie die Dokumente hinzu. Wir übernehmen die verfügbaren Angaben – so gibt es weniger Fragen.", "Continue": "Weiter", "Skip - I'll answer the questions": "Überspringen – ich beantworte die Fragen", "Back": "Zurück", "Check your claim": "Schadenmeldung prüfen", "Tap any line to change it. Blank is fine - we'll ask later if we need it.": "Tippen Sie auf eine Zeile, um sie zu ändern. Leere Angaben sind in Ordnung – falls nötig, fragen wir später danach.", "Sending…": "Wird gesendet …", "Send the update": "Änderung senden", "Send my claim": "Schadenmeldung senden", "Your claim is moving again.": "Ihre Schadenmeldung wird weiterbearbeitet.", "Thanks - your claim is in.": "Danke – Ihre Schadenmeldung ist eingegangen.", "We've added what you sent. No need to do anything else.": "Wir haben Ihre Angaben ergänzt. Sie müssen nichts weiter tun.", "We'll get back to you within 2 working days.": "Wir melden uns innerhalb von zwei Werktagen.", "Your claim reference": "Ihr Schadenszeichen", "Start another claim": "Weitere Schadenmeldung starten", "A claims specialist will contact you personally. Anything else you add below helps us prepare.": "Eine Sachbearbeitung wird sich persönlich bei Ihnen melden. Ihre weiteren Angaben helfen uns bei der Vorbereitung.", "We couldn't send your claim just now. Please try again in a moment.": "Ihre Schadenmeldung konnte gerade nicht gesendet werden. Bitte versuchen Sie es gleich noch einmal.",
  "What happened to your car?": "Was ist mit Ihrem Auto passiert?", "Damage to my car": "Schaden an meinem Auto", "My car was stolen": "Mein Auto wurde gestohlen", "Something else": "Etwas anderes", "Tell us in a few sentences what happened.": "Beschreiben Sie in wenigen Sätzen, was passiert ist.", "When did it happen?": "Wann ist es passiert?", "What is your policy number?": "Wie lautet Ihre Versicherungsnummer?", "Was another vehicle or person involved?": "Waren andere Fahrzeuge oder Personen beteiligt?", "Was anyone hurt?": "Wurde jemand verletzt?", "Is your car electric or a plug-in hybrid?": "Ist Ihr Auto elektrisch oder ein Plug-in-Hybrid?", "Could the high-voltage battery be affected?": "Könnte die Hochvoltbatterie beschädigt sein?", "How much is the repair quote?": "Wie hoch ist der Kostenvoranschlag?", "Do you have an itemized repair quote from a garage?": "Haben Sie einen detaillierten Kostenvoranschlag der Werkstatt?", "Do you have a police or incident report?": "Haben Sie einen Polizei- oder Unfallbericht?", "Yes": "Ja", "Not yet": "Noch nicht", "I'm not sure": "Ich bin nicht sicher", "Not sure": "Nicht sicher",
  "What": "Was", "happened?": "passiert?", "We ask so the right person looks at your claim.": "So kann die richtige Person Ihre Schadenmeldung prüfen.", "Collision, scrape, hail, vandalism…": "Zusammenstoß, Kratzer, Hagel, Vandalismus …", "Your own words help us understand it quickly.": "Ihre eigenen Worte helfen uns, den Vorfall schnell zu verstehen.", "We use the date to check your cover on that day.": "Anhand des Datums prüfen wir Ihren Versicherungsschutz.", "You'll find it on your insurance card - we need it to check your cover.": "Sie finden die Nummer auf Ihrer Versicherungskarte. Wir benötigen sie, um Ihren Versicherungsschutz zu prüfen.", "This tells us whether anyone else needs to be contacted.": "So wissen wir, ob wir weitere Personen kontaktieren müssen.", "It's fine if you don't know yet.": "Es ist in Ordnung, wenn Sie das noch nicht wissen.", "If so, a person - not a form - will be in touch.": "In diesem Fall meldet sich eine Person bei Ihnen.", "Electric cars sometimes need a specialist garage.": "Elektroautos benötigen manchmal eine Fachwerkstatt.", "A best guess is fine - say so if you're not sure.": "Eine Einschätzung reicht aus. Sagen Sie einfach, wenn Sie unsicher sind.", "An estimate from the garage is enough. In euros.": "Ein Kostenvoranschlag der Werkstatt reicht. Bitte in Euro.", "A quote that lists the parts and labour helps us move faster.": "Ein Kostenvoranschlag mit Teilen und Arbeitskosten beschleunigt die Bearbeitung.", "We need an incident report to process your claim - add it now if you have it.": "Für die Bearbeitung benötigen wir einen Schadensbericht. Fügen Sie ihn hinzu, falls vorhanden.",
  "Optional - helps us prepare": "Optional – hilft uns bei der Vorbereitung", "Add it now - we'll read it for you": "Jetzt hinzufügen – wir lesen es für Sie", "Or add the quote - we'll read it for you": "Oder Kostenvoranschlag hinzufügen – wir lesen ihn für Sie",
};

export type SiteToolsContextValue = ReturnType<typeof useSiteToolsState>;

function useSiteToolsState() {
  const [locale, setLocale] = useState<Locale>("en");
  const [theme, setTheme] = useState<Theme>("light");
  useEffect(() => {
    const savedLocale = localStorage.getItem(localeStorageKey);
    const savedTheme = localStorage.getItem(themeStorageKey);
    if (savedLocale === "en" || savedLocale === "de") setLocale(savedLocale);
    if (savedTheme === "dark" || savedTheme === "light") setTheme(savedTheme);
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.classList.toggle("light", theme === "light");
    localStorage.setItem(localeStorageKey, locale);
    localStorage.setItem(themeStorageKey, theme);
  }, [locale, theme]);
  const t = (value: string): string => {
    if (locale !== "de") return value;
    if (translations[value]) return translations[value];
    if (value.startsWith("We asked for ")) return `Wir baten um ${value.slice(13).split(" · ").map((s) => translations[s] ?? s).join(" · ")}`;
    if (value.startsWith("You sent ")) return `Sie haben ${value.slice(9).split(" · ").map((s) => translations[s] ?? s).join(" · ")} gesendet`;
    const reminder = value.match(/^Reminder (\d) sent \(simulated\)$/);
    if (reminder) return `Erinnerung ${reminder[1]} gesendet (simuliert)`;
    return value;
  };
  return { locale, setLocale, theme, setTheme, text: copy[locale], t };
}

export function SiteToolsProvider({ children }: { children: ReactNode }) {
  const value = useSiteToolsState();
  return <SiteToolsContext.Provider value={value}>{children}</SiteToolsContext.Provider>;
}

export function useSiteTools() {
  const context = useContext(SiteToolsContext);
  if (!context) throw new Error("useSiteTools must be used inside SiteToolsProvider");
  return context;
}

export function SiteTools() {
  const { locale, setLocale, theme, setTheme, text, t } = useSiteTools();
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<(ChatTurn & { status?: TrackingStatus; customerStatus?: ReturnType<typeof getCustomerStatus>; error?: boolean })[]>([]);
  const [role, setRole] = useState<AgentRole>("policy");
  const [loading, setLoading] = useState(false);
  const busy = useRef(false);
  const latest = useRef<HTMLDivElement>(null);
  const sendChat = useServerFn(askCanoe);
  useEffect(() => { latest.current?.scrollIntoView({ block: "nearest" }); }, [messages, loading, open]);
  const send = async (value = question, retry = false) => {
    const clean = value.trim();
    if (!clean || busy.current) return;
    const prior = retry ? messages.slice(0, -2) : messages;
    const next: ChatTurn[] = [...prior.filter((m) => !m.error).map(({ role, content }) => ({ role, content })), { role: "user", content: clean }];
    const parsed = chatInput.safeParse({ role, locale, messages: next.slice(-20) });
    if (!parsed.success) return;
    busy.current = true;
    setLoading(true);
    const userTurn: ChatTurn = { role: "user", content: clean };
    setMessages([...prior, userTurn].slice(-40));
    setQuestion("");
    try {
      const reply = await sendChat({ data: parsed.data });
      setMessages((items) => [...items, { role: "assistant", content: reply.text, ...(reply.status ? { status: reply.status } : {}), ...(reply.customerStatus ? { customerStatus: reply.customerStatus } : {}), ...(reply.error ? { error: true } : {}) }]);
    } catch { setMessages((items) => [...items, { role: "assistant", content: text.error, error: true }]); }
    finally { busy.current = false; setLoading(false); }
  };

  return <>
    <div className="canoe-site-controls" aria-label="Site preferences">
      <button className="canoe-tool-button canoe-theme-button" aria-label={theme === "light" ? text.theme : text.light} title={theme === "light" ? text.theme : text.light} onClick={() => setTheme(theme === "light" ? "dark" : "light")}>
        {theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
      </button>
      <label className="canoe-locale-select"><span className="sr-only">{text.language}</span>
        <select aria-label={text.language} value={locale} onChange={(event) => setLocale(event.target.value as Locale)}><option value="en">EN</option><option value="de">DE</option></select>
      </label>
    </div>
    {open && <section className="canoe-chat-panel" aria-label={text.chat}>
      <header className="canoe-chat-header"><span className="canoe-chat-brand"><span className="canoe-chat-mark"><ChatBoatMark /></span><span><strong>Canoe</strong><select className="canoe-chat-role" aria-label={text.role} value={role} disabled={loading} onChange={(e) => setRole(e.target.value as AgentRole)}>{(["policy", "support", "documents"] as const).map((r, i) => <option key={r} value={r}>{text.roles[i]}</option>)}</select></span></span><Button variant="ghost" className="canoe-chat-close" aria-label={text.close} onClick={() => setOpen(false)}><X size={18} /></Button></header>
      <div className="canoe-chat-body" aria-live="polite" aria-busy={loading}>
        <p className="canoe-chat-bubble canoe-chat-reply">{text.hello}</p>
        {messages.map((message, index) => <div key={index} className={`canoe-chat-bubble ${message.role === "user" ? "canoe-chat-user" : "canoe-chat-reply"}`}>
          {message.status && <ClaimStatusCard status={message.status} locale={locale} />}
          {message.customerStatus && <section className="canoe-chat-status"><strong>{message.customerStatus.caseId}</strong><p>{t(message.customerStatus.headline)}</p><p>{t(message.customerStatus.next)}</p><Link to="/track/$caseId" params={{ caseId: message.customerStatus.caseId }} className="underline underline-offset-4">{locale === "de" ? "Schaden verfolgen" : "Track your claim"} →</Link></section>}
          {message.role === "assistant" ? <ReactMarkdown>{message.content}</ReactMarkdown> : message.content}
          {message.error && index === messages.length - 1 && <Button variant="link" className="canoe-chat-retry" disabled={loading} onClick={() => send(messages[index - 1]?.content ?? "", true)}>{text.retry}</Button>}
        </div>)}
        {loading && <p className="canoe-chat-bubble canoe-chat-reply" role="status">{text.thinking}</p>}
        {messages.length === 0 && <div className="canoe-chat-topics">{text.topics.map((topic, i) => i === 0 ? <Button asChild variant="ghost" key={topic}><Link to="/track" onClick={() => setOpen(false)}>{topic}</Link></Button> : <Button variant="ghost" key={topic} disabled={loading} onClick={() => send(topic)}>{topic}</Button>)}</div>}
        <div ref={latest} />
      </div>
      <form className="canoe-chat-form" onSubmit={(event) => { event.preventDefault(); send(); }}><input value={question} maxLength={1200} onChange={(event) => setQuestion(event.target.value)} placeholder={text.prompt} aria-label={text.prompt} /><Button type="submit" aria-label={text.send} disabled={loading || !question.trim()}><Send size={16} /></Button></form>
    </section>}
    <button className="canoe-chat-launcher" aria-label={open ? text.close : `${locale === "de" ? "Frag Canoe" : "Ask Canoe"} - ${text.open}`} aria-expanded={open} title={text.chat} onClick={() => setOpen(!open)}>
      <span className="canoe-chat-logo">
        <ChatBoatMark />
        <svg className="canoe-chat-wave" viewBox="0 0 60 6" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 3 Q7.5 0.5 15 3 T30 3 T45 3 T60 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" vectorEffect="non-scaling-stroke" pathLength={60} />
        </svg>
      </span>
      <span className="canoe-chat-invite">{locale === "de" ? "Frag Canoe" : "Ask Canoe"}</span>
    </button>
  </>;
}
