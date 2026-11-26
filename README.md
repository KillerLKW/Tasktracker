# tasktracker

Statische Web-App für Aufgaben, Projekte, Wochen- und Semesterplanung sowie Standard- und Pomodoro-Zeiterfassung.

**Website:** [killerlkw.github.io/Tasktracker](https://killerlkw.github.io/Tasktracker/)

## Google Drive verbinden

Unter **Einstellungen → Google Drive** eine JSON-Trackerdatei auswählen oder den aktuellen Bestand als neue Drive-Datei speichern. Auf allen Geräten dieselbe Datei verwenden. Änderungen werden lokal gesichert und bei aktiver Google-Verbindung automatisch in dieselbe Datei geschrieben. Der Pi und eine VPN-Verbindung werden dafür nicht benötigt.

Für die erste Anmeldung sind ein eigenes Google-Cloud-Projekt, eine öffentliche OAuth-Client-ID und ein eingeschränkter Browser-API-Key erforderlich. Die Anmeldung des Drive-Connectors in einem Chat ersetzt diese Website-Anmeldung nicht. Die vollständigen Schritte stehen in **[DRIVE-EINRICHTUNG.md](DRIVE-EINRICHTUNG.md)** und sind aus den Einstellungen verlinkt. Ohne diese Projektangaben ist die App lokal nutzbar; die Drive-Verbindung ist noch nicht aktiviert.

Die App verwendet nur `drive.file`: Zugriff auf selbst erstellte oder bewusst über Google Picker freigegebene Dateien. Zugangstokens verbleiben in der Browser-Sitzung und gelangen nicht in Tracker-Exporte oder das Repository. Keine Client Secrets oder Dienstkontoschlüssel hinterlegen. Die offiziellen Google-Anmelde- und Picker-Skripte werden erst nach einer bewussten Einrichtungsaktion geladen. Für die lokale Nutzung werden sie nicht benötigt.

Geöffnete Geräte prüfen ungefähr alle drei Sekunden die Dateiversion. Hintergrund-Tabs können später aktualisieren. Google-Tokens laufen ab; dann **Google-Verbindung erneuern** wählen. Der letzte Arbeitsstand bleibt auch ohne Anmeldung nach dem Neuladen bearbeitbar und wird nach Wiederverbindung abgeglichen.

Unabhängige Änderungen werden anhand der zuletzt gemeinsam geladenen Version zusammengeführt. Bei widersprüchlichen Änderungen erscheint eine Auswahl. Jede Ersetzung einer vorhandenen Datei benötigt eine passende Dateiversion. Vor Schreibzugriffen prüft die App den Versionsschutz mit einer neuen temporären Testdatei und verschiebt diese anschließend in den Papierkorb. Bei fehlendem Schutz verweigert sie Schreibzugriffe. Der echte Google-Zugriff muss nach Einrichtung des Projekts noch geprüft werden; automatisierte Tests simulieren Google.

## Vorhandene Aufgaben übernehmen

1. Einen aktuellen JSON-Export des bisherigen Trackers sichern.
2. Auf der Website **Einstellungen → Dateien & Speicherung → Trackerdatei importieren** wählen. Alternativ die bereits in Drive liegende Datei direkt über Google Picker auswählen.
3. Bei lokal geöffnetem Bestand im Drive-Bereich **Aktuellen Tracker als neue Drive-Datei speichern** wählen.
4. Auf dem nächsten Gerät dieselbe Datei öffnen, keine weitere Kopie anlegen.

Unbekannte Felder alter Trackerdateien bleiben erhalten. Aufgaben, Projekte, Papierkorb, Zeitprotokolle und Semestereinstellungen werden als vollständige JSON-Datei weitergeführt. **Trackerdatei exportieren** bleibt als unabhängige Sicherung verfügbar. Browserdaten nicht löschen, solange Änderungen noch nicht übertragen wurden.

Ohne Drive-Verbindung bleiben Aufgaben und importierte Dateien lokal im jeweiligen Browser gespeichert. Desktop-Browser mit entsprechender Unterstützung können zusätzlich eine lokale Datei zum automatischen Speichern verbinden. Auf dem iPhone erfolgt der JSON-Export als normaler Download. Ein Download überschreibt keine importierte Datei. Die Option **Gerätespeicher dauerhaft anfordern** kann den Browser um dauerhafte Speicherung bitten; sie ersetzt keine Sicherung.

## Bisheriger Pi

Die bisherige Verbindung bleibt unter **Einstellungen → Synchronisierung → Bisherige Pi-Verbindung** für eine bewusste Übernahme verfügbar. Die GitHub-App kontaktiert keinen Pi allein aufgrund alter Verbindungseinträge; nur eine ausdrücklich ausgewählte Pi-Verbindung wird wiederhergestellt. Sobald eine Drive-Datei geöffnet ist, wird die Pi-Verbindung nicht mehr automatisch aufgenommen. Daten, Sicherungen und Dienste auf dem Pi werden durch die Drive-Einrichtung nicht gelöscht oder verändert.

## Website veröffentlichen

Kein Build-Schritt erforderlich. Die Anwendung besteht aus `index.html`, `styles.css`, `app.js`, `storage.js`, `drive.js` und den Logo-Dateien. Die lokale App funktioniert ohne die optionalen Google-Skripte.

`GitHub-Paket-erstellen.cmd` erzeugt ein neues Paket unter `GitHub-Veroeffentlichung`. Nur diesen Paketinhalt verwenden, niemals den gesamten ursprünglichen Projektordner hochladen. Das Paket umfasst zwölf Dateien: sieben Anwendungsdateien, README, Drive-Anleitung, `.gitignore`, `.nojekyll` und den Pages-Workflow. Private Trackerdateien, Backups, Pi-Schlüssel und Zertifikate sind ausgeschlossen.

Der Workflow kopiert ausschließlich die ausdrücklich aufgelisteten Website-Dateien und die Drive-Anleitung nach `_site`, prüft die JavaScript-Syntax und veröffentlicht mit GitHub Pages. Im vorhandenen Repository liegt der Workflow unter `.github/workflows/main.yml`; die lokale Paketvorlage heißt `.github/workflows/pages.yml`. Bei Aktualisierungen den vorhandenen Workflow ersetzen, keinen zweiten Veröffentlichungsworkflow anlegen.

GitHub: **Settings → Pages → Build and deployment → Source → GitHub Actions**. Jeder Push auf `main` startet die Veröffentlichung. Unter **Actions** den erfolgreichen Build und das Deployment prüfen. Aufgaben werden dadurch weder ins Repository noch auf die öffentliche Website hochgeladen.

## Referenzen

- [Google Drive einrichten](DRIVE-EINRICHTUNG.md)
- [Google-Anmeldung und Token-Laufzeit](https://developers.google.com/identity/oauth2/web/guides/use-token-model)
- [Google Picker](https://developers.google.com/workspace/drive/picker/guides/web-picker)
- [GitHub Pages mit Actions](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)

Stand: 26.11.2026.
