# tasktracker

Statische Web-App für Aufgaben, Projekte, Wochen- und Semesterplanung sowie Standard-/Pomodoro-Zeiterfassung. Die Website benötigt keinen Build-Schritt und keine externen JavaScript-Bibliotheken.

## Stand der GitHub-Veröffentlichung

Die Website läuft unter **https://killerlkw.github.io/Tasktracker/**. Die GitHub-Version wird vorerst bewusst **ohne Cloud-Synchronisierung** betrieben. Aufgaben werden auf dem jeweiligen Gerät automatisch im Browser gespeichert. Eine Installation auf mehreren Geräten führt deshalb zu getrennten Datenbeständen.

### Verwendung im Alltag

- Website über die obige HTTPS-Adresse öffnen und Aufgaben direkt erstellen. Der Arbeitsstand bleibt beim Neuladen erhalten; eine Dateiverbindung ist dafür nicht erforderlich.
- Unter **Einstellungen → Dateien & Speicherung → Trackerdatei importieren** den bisherigen JSON-Tracker übernehmen. Importierte Daten werden getrennt von Browseraufgaben weitergeführt. Unbekannte Felder alter Dateien bleiben beim Export erhalten.
- **Trackerdatei exportieren** sichert den gesamten geöffneten Bestand einschließlich erledigter Aufgaben, Papierkorb, Projekte, Zeiterfassung und Semestereinstellungen. Auf dem iPhone erscheint dafür der normale Download. Der Download überschreibt die zuvor importierte Datei nicht automatisch.
- In unterstützten Desktop-Browsern lässt sich zusätzlich eine Datei zum automatischen Speichern verbinden. Nicht unterstützte Ordner- und Dateifunktionen werden ausgeblendet.
- Falls angeboten, kann **Gerätespeicher dauerhaft anfordern** den Browser um dauerhafte Speicherung bitten. Die Entscheidung trifft der Browser. Das ersetzt keinen JSON-Export; beim bewussten Löschen der Website-Daten wird auch dieser Speicher entfernt.

Zum manuellen Gerätewechsel den aktuellen Tracker exportieren und auf dem anderen Gerät importieren. Getrennte Bearbeitungen auf zwei Geräten werden nicht zusammengeführt. Die HTTPS-Adresse immer gleich verwenden: lokale Datei, Pi und GitHub Pages haben getrennte Browser-Speicherbereiche.

Der Pi wird von der GitHub-Pages-Version nicht angesprochen. Es werden keine Aufgaben, Sicherungen, Zertifikate oder Zugangsschlüssel mit veröffentlicht. Die unmarkierten Originaldateien können weiterhin für den bisherigen lokalen/Pi-Betrieb genutzt werden.

## 1. Veröffentlichung vorbereiten

Im ursprünglichen Windows-Projekt `GitHub-Paket-erstellen.cmd` ausführen. Es erzeugt einen neuen Ordner und ein ZIP unter `GitHub-Veroeffentlichung`. **Nur den Inhalt dieses erzeugten Paketordners veröffentlichen.** Der gesamte ursprüngliche Projektordner enthält private Trackerdateien und gehört nicht in den Web-Upload.

Das Paket enthält genau zehn Dateien: sechs Website-Dateien, diese Anleitung, `.gitignore`, `.nojekyll` und `.github/workflows/pages.yml`. Dot-Dateien und der Workflow müssen erhalten bleiben. Das ZIP ist zum Transport gedacht; es darf nicht als einzelne ZIP-Datei ins Repository hochgeladen werden.

Die `.gitignore` arbeitet mit einer Positivliste. Sie verhindert versehentliche neue Git-Aufnahmen anderer Dateien; bereits früher eingecheckte Dateien werden dadurch nicht automatisch entfernt. Deshalb ein neues leeres Repository und das saubere Paket verwenden. Auch der Pages-Workflow veröffentlicht ausschließlich die sechs ausdrücklich ausgewählten Website-Dateien plus `.nojekyll`.

## 2. Neues Repository auf GitHub anlegen

Ein leeres Repository, zum Beispiel `tasktracker`, anlegen. Keine zusätzliche README oder Gitignore auf GitHub erzeugen. Für GitHub Pages mit GitHub Free ein öffentliches Repository verwenden; private Repositories benötigen einen passenden Tarif. Aufgaben und Schlüssel bleiben unabhängig davon privat außerhalb des Repositorys.

## 3. Paket hochladen

Im erzeugten Paketordner ein Terminal öffnen. Git muss installiert sein. `DEIN-BENUTZERNAME` und gegebenenfalls den Repositorynamen ersetzen:

```powershell
git init -b main
git add .
git status --short
git commit -m "Prepare tasktracker for GitHub Pages"
git remote add origin https://github.com/DEIN-BENUTZERNAME/tasktracker.git
git push -u origin main
```

Bei `git status --short` dürfen nur die zehn Paketdateien erscheinen. Die Anmeldung bei GitHub erfolgt über den eigenen normalen Git-Anmeldeweg; Passwörter oder Tokens gehören nicht in diese Befehle, die URL oder die Website-Dateien.

## 4. GitHub Pages einschalten

Im Repository **Settings → Pages → Build and deployment → Source → GitHub Actions** auswählen. Unter **Actions** den Workflow **Publish tasktracker to GitHub Pages** bei Bedarf über **Run workflow** starten. Nach erfolgreichem Lauf steht die veröffentlichte Adresse in der Deployment-Umgebung `github-pages` und in Settings → Pages.

Die Standardadresse ist `https://DEIN-BENUTZERNAME.github.io/tasktracker/`. Den vollständigen Projektpfad mit abschließendem `/` verwenden. Die internen Dateien sind relativ verlinkt; eine eigene Domain kann später eingerichtet werden. Eine leere Seite oder ein 404 direkt nach der Einrichtung ist zunächst im Actions-Lauf zu prüfen.

## 5. Aufgaben übernehmen

Vor dem Wechsel einen aktuellen JSON-Export des bisherigen Trackers sichern. Auf der veröffentlichten Website **Einstellungen → Dateien & Speicherung → Trackerdatei importieren** wählen und den eigenen Export bewusst öffnen. Der Start unter GitHub Pages besitzt einen anderen Browser-Speicherbereich als die lokale Datei oder die Pi-Adresse; bestehende Browserdaten werden nicht automatisch übertragen.

Auf unterstützten Browsern kann **Automatisches Speichern aktivieren** die lokale Datei verbinden. Ohne diese Dateiberechtigung werden Änderungen lokal zwischengesichert bzw. als Download exportiert. GitHub Pages speichert die private Trackerdatei nicht im Repository und synchronisiert sie noch nicht zwischen Geräten.

## Spätere Änderungen veröffentlichen

Im Ursprungsprojekt das Paket erneut erstellen. Die sechs aktualisierten Website-Dateien und gegebenenfalls den Workflow in das bereits vorhandene lokale Git-Repository übernehmen; dessen `.git`-Ordner erhalten. Vor Commit/Push die Dateiliste prüfen. Jeder Push auf `main` führt die automatische Veröffentlichung aus. Der Pi-Updater wird dafür nicht verwendet.

## Noch offen: gemeinsamer Cloud-Datenbestand

Für Echtzeit-Synchronisierung ohne Pi wäre ein eigener Cloud-Datenzugriff mit Anmeldung, Zugriffsregeln, Versions-/Konfliktschutz und Export erforderlich. Der Nutzer hat am 25.11.2026 vorerst den Betrieb ohne Cloud-Synchronisierung gewählt. Vor dem Abschalten des Pi einen aktuellen JSON-Export sichern und in der GitHub-Version prüfen.

## Referenzen

- [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
- [GitHub Pages mit eigenen Actions-Workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)

Stand: 25.11.2026. Die Veröffentlichung der Website überträgt keine persönlichen Aufgaben; diese werden bewusst per Trackerdatei importiert.
