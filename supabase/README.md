# Supabase für den tasktracker einrichten

Die Anbindung ist optional. Solange kein Projekt eingerichtet und kein Cloud-Tracker geöffnet ist, bleiben Aufgaben lokal. Ein vorhandener Pi wird durch die Einrichtung nicht verändert.

## 1. Projekt anlegen

Bei [Supabase](https://supabase.com/dashboard) anmelden, ein neues Projekt erstellen und auf dessen Bereitstellung warten. Zum Einstieg reicht für einen kleinen persönlichen Tracker üblicherweise der Free-Tarif. Eine passende europäische Region wählen. Das Datenbankpasswort privat aufbewahren; es gehört nicht in die Website oder in den Chat.

## 2. Datenbank vorbereiten

Im Supabase-Projekt **SQL Editor → New query** öffnen. Den vollständigen Inhalt von [setup.sql](setup.sql) einfügen und mit **Run** ausführen. Das Skript erstellt:

- Einen Tracker pro angemeldetem Konto, einschließlich aller unbekannten JSON-Felder alter Trackerdateien.
- Leseschutz durch Row Level Security: nur der angemeldete Eigentümer sieht seinen Tracker.
- Einen atomaren Schreibweg mit Versionsvergleich. Direkte Schreibzugriffe auf die Tabelle sind für Browserkonten gesperrt. Eine Erstkopie kann keinen vorhandenen Tracker ersetzen.
- Realtime-Benachrichtigungen über Änderungen. Zusätzlich prüft die App den Stand regelmäßig, falls eine Benachrichtigung ausbleibt.

Das Skript kann erneut ausgeführt werden, ohne Tracker zu löschen. Vor Änderungen an einem bereits benutzten Projekt trotzdem einen JSON-Export sichern. Die Cloud-Version akzeptiert Tracker bis 16 MiB JSON; große eingebettete Anhänge gehören nicht in diese Datenbank.

## 3. Anmeldung konfigurieren

Unter **Authentication → URL Configuration** die Site URL auf `https://killerlkw.github.io/Tasktracker/` setzen. Unter den Anmeldeanbietern E-Mail/Passwort aktivieren. Mit der Standardeinstellung muss eine neue E-Mail-Adresse bestätigt werden.

Die App bietet **Konto erstellen** und **Anmelden**. Bei Problemen mit der Bestätigungsmail den E-Mail-Versand des Projekts prüfen. Alternativ kann der Projektinhaber sein eigenes Konto unter **Authentication → Users → Add user → Create new user** mit E-Mail, Passwort und **Auto Confirm User** anlegen. Das Datenbankpasswort ist nicht das Passwort des App-Kontos.

## 4. Projekt mit der App verbinden

Im Supabase-Projekt unter **Connect / API Keys** bzw. **Project Settings → API** die Projekt-URL und den öffentlichen **Publishable-Key** kopieren. Ein älterer öffentlicher **anon-Key** wird ebenfalls unterstützt.

In der App **Einstellungen → Cloud-Synchronisierung → Supabase-Projekt einrichten** öffnen und die beiden Werte eintragen. **Keinen Secret- oder service_role-Key verwenden.** Die App weist solche Schlüssel zurück. Mit deinem App-Konto anmelden. Projektangaben und Sitzung werden auf diesem Gerät gespeichert; das Passwort wird nicht gespeichert und nach der Anmeldung aus dem Formular entfernt.

## 5. Aufgaben übernehmen und weitere Geräte verbinden

Auf dem Gerät mit den aktuellen Aufgaben:

1. Eine aktuelle Trackerdatei als zusätzliche Sicherung exportieren.
2. Den gewünschten Tracker importieren oder die gewünschten Browseraufgaben öffnen.
3. Unter Cloud-Synchronisierung **Aktuellen Stand als Erstkopie hochladen** wählen. Das funktioniert nur, solange dieses Konto noch keinen Cloud-Tracker besitzt.

Auf weiteren Geräten dieselbe GitHub-Adresse öffnen, dasselbe Supabase-Projekt verbinden und mit **demselben App-Konto** anmelden. Danach **Cloud-Tracker öffnen** wählen. Andere Konten besitzen eigene, getrennte Tracker; diese Version bietet noch keine Freigabe zwischen verschiedenen Konten.

## Verhalten im Alltag

- Im geöffneten Cloud-Tracker werden Aufgaben, Fristen, Unteraufgaben, Fortschritt, Projekte und ihre Reihenfolge, Semester, Wiederholungen, Papierkorb und Zeiterfassung automatisch gemeinsam gespeichert.
- Unabhängige Änderungen verschiedener Geräte werden anhand des letzten gemeinsamen Stands zusammengeführt. Bei widersprüchlichen Änderungen erscheint in den Einstellungen **Konflikte klären**. Abbrechen erhält die lokale Fassung.
- Bei Ausfall der Verbindung bleibt der Cloud-Arbeitsstand im Browser gespeichert. Er lässt sich nach Neuladen weiterbearbeiten. Nach Wiederverbindung wird zusammengeführt; ein älterer Stand überschreibt keinen neueren ungeprüft.
- Während eines geöffneten Aufgaben- oder Semesterdialogs werden keine fremden Änderungen in das Formular übernommen. Nach dem Schließen erfolgt der Abgleich.
- JSON-Sicherungen bleiben verfügbar. Ein Export trennt die Cloud-Verbindung nicht. Ein bewusster Wechsel zu Browseraufgaben oder zu einer anderen Trackerdatei pausiert sie, ohne den Cloud-Tracker zu löschen.
- Abmelden entfernt die Anmeldesitzung und blendet den Cloud-Tracker aus. Der zuletzt gesicherte Arbeitsstand bleibt konto- und projektspezifisch auf diesem Gerät erhalten. Abmelden ist kein Löschvorgang.
- Browser-Theme, Filter und die Sichtbarkeit des kleinen Timers bleiben Geräteeinstellungen.

## Prüfung und Grenzen

Vor Veröffentlichung werden Anmeldung und Cloud-Protokoll mit simulierten Supabase-Antworten, zwei getrennten Browser-Geräten, Offline-Neuladen, parallelen Änderungen, Konflikten, Token-Erneuerung und Export geprüft. Ein echter End-to-End-Test von Auth, SQL-Berechtigungen und Realtime ist erst nach Anlegen und Einrichten des Supabase-Projekts möglich. Vor dem Abschalten des Pi diesen Test mit zwei Geräten durchführen.

Der kostenlose Supabase-Tarif kann bei geringer Aktivität pausieren und enthält keine automatischen Datenbank-Backups. Eigene JSON-Exporte beibehalten. Aktuelle Bedingungen: [Supabase-Preise](https://supabase.com/pricing).

Technische Referenzen: [API-Schlüssel](https://supabase.com/docs/guides/getting-started/api-keys), [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security), [Realtime-Protokoll](https://supabase.com/docs/guides/realtime/protocol).
