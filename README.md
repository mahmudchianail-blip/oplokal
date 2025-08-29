# oplokal

Dieses Projekt enthält ein Skript, das die Inhalte einer kombinierten `data.json` auf einzelne Dateien verteilt.

## Daten aufteilen

Führe den folgenden Befehl aus, um die Daten aus `data.json` in die jeweiligen Dateien zu schreiben:

```bash
node splitData.js
```

Das Skript erwartet, dass `data.json` die Schlüssel `Bestellung`, `Bewegung`, `Buchungen`, `Konto` und `Lager` enthält.

Standard-Administratorzugang:

- E-Mail: `admin@example.com`
- Passwort: `admin123`
