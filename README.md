# tasktracker

Statische Web-App für Aufgaben, Projekte, Wochen- und Semesterplanung sowie Standard-/Pomodoro-Zeiterfassung. Die Website benötigt keinen Build-Schritt und keine externen JavaScript-Bibliotheken.

## Stand der GitHub-Veröffentlichung

Die Website läuft unter **https://killerlkw.github.io/Tasktracker/**. Sie kann den gemeinsamen Tracker auf dem Pi über HTTPS laden und in Echtzeit synchronisieren. Ohne bewusst eingerichtete Pi-Verbindung werden Aufgaben weiterhin nur auf dem jeweiligen Gerät gespeichert. Es gibt keine Supabase-Anbindung.

### GitHub-Website mit dem Pi verbinden

1. Im Heimnetz oder mit aktivem VPN die lokale Datei `Pi-Sync-updaten.cmd` ausführen. Sie aktualisiert ausschließlich den Pi-Dienst und dessen HTTPS-Route; Trackerdatei, Sicherungen und vorhandener Freigabeschlüssel bleiben erhalten. SSH- und gegebenenfalls sudo-Anmeldung erfolgen interaktiv. Standardziel ist `ludwig@homeserver.fritz.box`.
2. Auf jedem Gerät `https://homeserver.fritz.box/` im Browser öffnen und prüfen, dass HTTPS ohne Zertifikatsfehler funktioniert. Das vorhandene lokale Stammzertifikat muss auf dem Gerät als vertrauenswürdig eingerichtet sein. Die Zertifikatsprüfung wird von der App nicht umgangen.
3. Auf der GitHub-Website **Einstellungen → Synchronisierung** öffnen. Als Pi-Adresse `https://homeserver.fritz.box` und den vorhandenen Freigabeschlüssel eintragen. **Pi-Tracker laden** wählen. Wenn der Browser nach lokalem Netzwerkzugriff fragt, diesen für die Tracker-Website erlauben.
4. Auf dem zweiten Gerät dieselbe Verbindung einrichten. Beide bearbeiten dann dieselbe Datei `/var/lib/tasktracker2-sync/tracker.json` auf dem Pi. Änderungen werden automatisch gespeichert und per Long Polling an geöffnete Geräte übertragen. Beim Neuladen wird eine zuvor bewusst gespeicherte Verbindung wieder aufgenommen.

**Aktuellen Stand als Erstkopie auf den Pi laden** ist nur für einen noch leeren Pi-Speicher gedacht. Eine vorhandene Trackerdatei wird dadurch nicht überschrieben. Parallele Bearbeitungen werden mit Versionsvergleich und Dreiwege-Zusammenführung geschützt; widersprüchliche Änderungen erfordern eine Auswahl. Der JSON-Export bleibt nutzbar.

Der Pi benötigt das neue `Server/tracker-api.py`. Die Browserfreigabe erlaubt standardmäßig ausschließlich `https://killerlkw.github.io` sowie die Pi-Website selbst. Sie gibt keine Daten ohne Freigabeschlüssel frei. Eigene Website-Domains müssen ausdrücklich über `TASKTRACKER2_ALLOWED_ORIGINS` im Pi-Dienst freigegeben werden. Der Dienst bleibt hinter Nginx auf Loopback-Port 8794 gebunden; es wird kein zusätzlicher öffentlicher Port geöffnet. Für die Nutzung unterwegs bleibt das VPN erforderlich.

### Verwendung im Alltag

- Website über die obige HTTPS-Adresse öffnen und Aufgaben direkt erstellen. Der Arbeitsstand bleibt beim Neuladen erhalten; eine Dateiverbindung ist dafür nicht erforderlich.
- Unter **Einstellungen → Dateien & Speicherung → Trackerdatei importieren** den bisherigen JSON-Tracker übernehmen. Importierte Daten werden getrennt von Browseraufgaben weitergeführt. Unbekannte Felder alter Dateien bleiben beim Export erhalten.
- **Trackerdatei exportieren** sichert den gesamten geöffneten Bestand einschließlich erledigter Aufgaben, Papierkorb, Projekte, Zeiterfassung und Semestereinstellungen. Auf dem iPhone erscheint dafür der normale Download. Der Download überschreibt die zuvor importierte Datei nicht automatisch.
- In unterstützten Desktop-Browsern lässt sich zusätzlich eine Datei zum automatischen Speichern verbinden. Nicht unterstützte Ordner- und Dateifunktionen werden ausgeblendet.
- Falls angeboten, kann **Gerätespeicher dauerhaft anfordern** den Browser um dauerhafte Speicherung bitten. Die Entscheidung trifft der Browser. Das ersetzt keinen JSON-Export; beim bewussten Löschen der Website-Daten wird auch dieser Speicher entfernt.

Ohne Pi-Verbindung zum Gerätewechsel den aktuellen Tracker exportieren und auf dem anderen Gerät importieren. Im geöffneten Pi-Tracker werden Änderungen automatisch gemeinsam gespeichert. Die HTTPS-Adresse immer gleich verwenden: lokale Datei, Pi und GitHub Pages haben getrennte Browser-Speicherbereiche.

Ohne explizite Verbindung wird der Pi von der GitHub-Pages-Version nicht angesprochen. Aufgaben, Sicherungen, Zertifikate und Freigabeschlüssel werden nicht im Repository veröffentlicht. Die Website vom Pi bleibt ebenfalls nutzbar.

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

Auf unterstützten Browsern kann **Automatisches Speichern aktivieren** die lokale Datei verbinden. Ohne diese Dateiberechtigung werden Änderungen lokal zwischengesichert bzw. als Download exportiert. GitHub Pages speichert die private Trackerdatei nicht im Repository; die gemeinsame Synchronisierung übernimmt der ausdrücklich verbundene Pi.

## Spätere Änderungen veröffentlichen

Im Ursprungsprojekt das Paket erneut erstellen. Die sechs aktualisierten Website-Dateien und gegebenenfalls den Workflow in das bereits vorhandene lokale Git-Repository übernehmen; dessen `.git`-Ordner erhalten. Vor Commit/Push die Dateiliste prüfen. Jeder Push auf `main` führt die automatische Veröffentlichung aus. Der Pi-Updater wird dafür nicht verwendet.

## Speicherung auf dem Pi

Der gemeinsame Datenbestand liegt weiterhin auf dem Pi. GitHub liefert nur die Website aus. Das Dienst-Update verändert keine Aufgaben und setzt den Freigabeschlüssel nicht zurück. Vor jeder geänderten Trackerdatei legt der Dienst eine Sicherung im Unterordner `backups` an; Schreibvorgänge erfolgen atomar und erfordern eine passende Dateiversion.

## Referenzen

- [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
- [GitHub Pages mit eigenen Actions-Workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)

Stand: 26.11.2026. Die Veröffentlichung der Website überträgt keine persönlichen Aufgaben; ein vorhandener Tracker wird bewusst importiert oder über „Pi-Tracker laden“ geöffnet.
