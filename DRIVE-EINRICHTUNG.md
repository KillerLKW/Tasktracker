# Google Drive einrichten

Die Website läuft unter [killerlkw.github.io/Tasktracker](https://killerlkw.github.io/Tasktracker/). Die Tracker bleiben normale JSON-Dateien in deinem Google Drive. Auf jedem Gerät dieselbe Datei auswählen. Pi, VPN und Supabase werden dafür nicht gebraucht.

## Anmeldung auf der eingerichteten Website

Die öffentliche Client-ID und der Browser-API-Key sind für diese Website bereits hinterlegt. **Einstellungen → Google Drive → Google-Anmeldung laden** wählen, danach **Mit Google verbinden**. Mit dem bei Google als Testnutzer eingetragenen Konto anmelden. Anschließend **Andere Drive-Datei auswählen** verwenden oder den aktuellen lokalen Tracker als neue Drive-Datei speichern. Auf weiteren Geräten dieselbe Datei auswählen. Die Projektangaben müssen dort nicht erneut eingegeben werden, solange keine eigenen Angaben im Browser gespeichert wurden.

Die folgenden Schritte brauchst du nur zur Verwaltung der Google-Konfiguration oder für eine eigene Installation.

Die Google-Verbindung dieses Chats und die Anmeldung deiner Website sind getrennt. Für die Website brauchst du einmalig ein Google-Cloud-Projekt. Benötigt werden ausschließlich die öffentliche OAuth-Client-ID und ein auf deine Website beschränkter Browser-API-Key. Ein Client Secret, Kontopasswort oder Dienstkontoschlüssel gehört niemals in die App oder ins Repository.

## 1. Projekt und APIs

1. Die [Google Cloud Console](https://console.cloud.google.com/) öffnen und mit deinem Google-Konto anmelden.
2. Oben die Projektauswahl öffnen → **Neues Projekt**. Zum Beispiel `Tasktracker` nennen und erstellen. Anschließend dieses Projekt auswählen.
3. Unter **APIs und Dienste → Bibliothek** nacheinander **Google Drive API** und **Google Picker API** suchen und aktivieren.

## 2. Zustimmung zur Anmeldung

1. **Google Auth Platform** öffnen, gegebenenfalls **Jetzt starten / Get started** wählen.
2. Unter **Branding** den App-Namen `Tasktracker`, deine Support-E-Mail und eine Kontakt-E-Mail eintragen.
3. Unter **Audience / Zielgruppe** **External / Extern** wählen. Solange die App im Testmodus bleibt, dein eigenes Google-Konto unter **Test users / Testnutzer** hinzufügen. Weitere Personen müssen dort ebenfalls hinzugefügt werden.
4. Unter **Data Access / Datenzugriff** den Bereich `https://www.googleapis.com/auth/drive.file` hinterlegen. Die App braucht keinen vollständigen Zugriff auf dein Drive: Sie darf Dateien bearbeiten, die sie selbst erstellt oder die du ausdrücklich in der Google-Dateiauswahl freigibst.

Die Google-Oberfläche kann deutsch oder englisch angezeigt werden. Bei einer Warnung über eine nicht überprüfte eigene Test-App nur fortfahren, wenn der angezeigte Projektname und das angemeldete Konto deinen Angaben entsprechen.

## 3. OAuth-Client-ID

1. Unter **Google Auth Platform → Clients → Create client / Client erstellen** den Anwendungstyp **Web application / Webanwendung** wählen.
2. Unter **Authorized JavaScript origins / Autorisierte JavaScript-Quellen** genau diese Adresse eintragen:

   `https://killerlkw.github.io`

   Hier keinen Pfad `/Tasktracker/` anhängen. Für diese Anmeldung sind keine Redirect-URIs erforderlich.
3. Erstellen und die **Client-ID** kopieren. Sie endet auf `.apps.googleusercontent.com`. Ein gegebenenfalls angezeigtes Client Secret wird nicht benötigt.

## 4. API-Key für die Dateiauswahl

1. **APIs und Dienste → Anmeldedaten → Anmeldedaten erstellen → API-Schlüssel** öffnen.
2. Den Schlüssel bearbeiten. Unter **Anwendungseinschränkungen** **Websites / HTTP-Verweis-URLs** wählen und diese drei Einträge hinzufügen:

   `https://killerlkw.github.io`

   `https://killerlkw.github.io/*`

   `https://docs.google.com/*`

   Eine frühere Beschränkung nur auf `/Tasktracker/*` ersetzen: Browser senden bei Anfragen an Google häufig nur die Herkunftsadresse ohne Pfad. Google Picker benötigt zusätzlich seine eigene iframe-Adresse `docs.google.com`. Die Website verwendet dafür die Referrer-Policy `strict-origin-when-cross-origin`.

3. Unter **API-Einschränkungen → Schlüssel einschränken** die **Google Picker API** auswählen und speichern.
4. Den API-Key kopieren. Dies ist ein öffentlicher Browserschlüssel; die Einschränkungen sind wichtig. Änderungen bei Google können etwas Zeit bis zur Aktivierung brauchen.

## 5. Im Tracker verbinden und Daten übernehmen

1. Die GitHub-Website öffnen → **Einstellungen → Google Drive → Google-Anbindung einrichten**.
2. Client-ID und API-Key eintragen, speichern und die Google-Anmeldung laden. Danach **Mit Google verbinden** wählen und die Freigabe erteilen. Auf Mobilgeräten die Anmeldung bewusst per Schaltfläche starten; Pop-ups dafür zulassen.
3. **Bestehende Trackerdatei:** **Datei auswählen** öffnen und deine JSON-Datei auswählen. Das gewährt der Website Zugriff auf genau diese Datei. Eine nur vom Chat oder einer anderen App hochgeladene Datei muss hier ebenfalls einmal ausgewählt werden.
4. **Neuer Drive-Tracker aus dem aktuellen Stand:** Zuerst die aktuelle JSON-Datei in den Tracker importieren oder den bisherigen Pi-Tracker bewusst laden. Anschließend im Drive-Bereich **Aktuellen Tracker als neue Drive-Datei speichern** öffnen, Namen vergeben und die Datei erstellen. Es wird eine neue Datei angelegt; vorhandene Drive-Dateien werden dabei nicht ersetzt.
5. Auf anderen Geräten dieselben öffentlichen Projektangaben hinterlegen, mit demselben Google-Konto anmelden und **dieselbe Datei** auswählen. Nicht auf jedem Gerät eine neue Kopie anlegen.

Client-ID und eingeschränkter API-Key können später als öffentliche App-Konfiguration hinterlegt werden, damit die Eingabe auf weiteren Geräten entfällt. Deine Anmeldung und die ausgewählte Trackerdatei werden dadurch nicht öffentlich.

## Speichern und Synchronisieren

- Änderungen werden zuerst auf dem Gerät gesichert und bei aktiver Verbindung automatisch in dieselbe Drive-Datei geschrieben. Die Datei-ID bleibt erhalten. Andere geöffnete Geräte prüfen ungefähr alle drei Sekunden die Dateiversion. Hintergrund-Tabs und gesperrte Handys können verzögert aktualisiert werden.
- Unabhängige Änderungen werden zusammengeführt. Bei Änderungen am selben Feld erscheint eine Auswahl. Abbrechen bewahrt deinen lokalen Arbeitsstand und überschreibt die andere Version nicht.
- Vor Schreibzugriffen prüft die App den Versionsschutz an einer eigens erstellten temporären Testdatei. Diese wird anschließend in den Drive-Papierkorb verschoben. Schlägt die Prüfung fehl, werden vorhandene Trackerdateien nicht überschrieben. Diese Prüfung ersetzt keine regelmäßige Sicherung.
- Google-Zugriffstokens laufen nach begrenzter Zeit ab. Unter **Einstellungen → Google Drive → Google-Verbindung erneuern** erneut anmelden. Bis dahin bleiben Änderungen lokal gespeichert und werden nach der Wiederverbindung zusammengeführt. Es gibt keine unbegrenzt gültige Hintergrundanmeldung.
- Der letzte Drive-Arbeitsstand wird nach dem Neuladen auch ohne Verbindung geöffnet. Browserdaten nicht löschen, solange Änderungen noch nicht nach Drive übertragen wurden. **JSON exportieren** bleibt als unabhängige Sicherung verfügbar.
- **Verbindung trennen** entfernt die lokale Anmeldung, löscht aber keine Datei in Drive. Der bisherige Pi wird durch die Drive-Einrichtung nicht verändert.
- Ein hier beauftragter direkter Eingriff in dieselbe Drive-JSON-Datei kann von der App eingelesen werden. Dabei dieselbe Datei-ID verwenden und parallele widersprüchliche Bearbeitungen vermeiden.

## Wenn etwas nicht klappt

- **origin_mismatch:** OAuth-Quelle ohne Pfad prüfen: `https://killerlkw.github.io`.
- **access_denied:** Im Testmodus das verwendete Google-Konto als Testnutzer eintragen und `drive.file` zulassen.
- **Dateiauswahl verweigert / API-Key ungültig:** Picker API, API-Key-Einschränkung und die drei Website-Einträge aus Schritt 4 prüfen. Eine Einschränkung nur auf den Pfad `/Tasktracker/*` reicht nicht aus. Client und Key müssen zum selben Cloud-Projekt gehören.
- **Datei nicht gefunden:** Mit dem richtigen Konto anmelden und die Datei erneut über **Datei auswählen** freigeben.
- **Versionsschutz nicht bestätigt:** Nicht durch ungeschützte Schreibzugriffe umgehen. Lokalen Stand exportieren und die konkrete Fehlermeldung prüfen lassen.

Die Verbindung muss nach Eintragung deiner Projektangaben einmal mit dem echten Google-Konto geprüft werden. Automatisierte Tests verwenden einen simulierten Google-Server und ersetzen diese Prüfung nicht.

Offizielle Anleitungen: [Google-Anmeldung und Token-Laufzeit](https://developers.google.com/identity/oauth2/web/guides/use-token-model), [Google Picker](https://developers.google.com/workspace/drive/picker/guides/web-picker), [Picker-API-Key und erlaubte Websites](https://developers.google.com/workspace/drive/picker/guides/web-picker-sample), [Drive-Berechtigungen](https://developers.google.com/workspace/drive/api/guides/api-specific-auth).
