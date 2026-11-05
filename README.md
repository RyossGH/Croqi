# Croqi – application mobile (iPhone)

Application web installable (PWA) pour piloter le distributeur de croquettes Croqi (SAÉ 3.03).
C'est le bloc **« Client · IHM »** de l'architecture : elle parle au serveur Java en HTTP (Protocole B).

## Écrans

| Onglet | Contenu |
|---|---|
| Accueil | Niveau du réservoir (%), dernier repas, passages du jour, mode Auto/Manuel, prochain repas, bouton « Servir » (1 à 5 portions) + alertes (niveau bas, pas de repas depuis X h, objet déconnecté) |
| Planning | Jusqu'à 6 repas/jour, 1 à 5 portions chacun, envoi au distributeur |
| Historique | Graphique 7 jours (portions / passages) + journal 30 jours filtrable |
| Réglages | Seuil « pas de repas depuis », seuil « niveau bas », déconnexion |

**Mode démo** : bouton sur l'écran de connexion. Tout est simulé dans le téléphone, pas besoin de serveur.

## Mettre l'app sur l'iPhone

**En ligne (le plus simple)** : ouvre **https://ryossgh.github.io/Croqi/** dans Safari, puis **Partager** → **Sur l'écran d'accueil**. Pas besoin du PC.

> En ligne, l'app est en HTTPS : le navigateur bloquera les appels vers un serveur en `http://` sur le réseau local. Le mode démo marche partout ; pour le vrai distributeur, utilise la version locale ci-dessous (ou un serveur en HTTPS).

**En local, depuis le PC** :

1. Double-clique sur `Lancer-Croqi.bat` (autorise Java dans le pare-feu Windows si demandé, réseau privé).
2. Sur l'iPhone, **même Wi-Fi que le PC**, ouvre Safari à l'adresse affichée (ex. `http://192.168.1.20:8000`).
3. Bouton **Partager** → **Sur l'écran d'accueil** → Ajouter.

L'icône Croqi apparaît sur l'écran d'accueil et s'ouvre en plein écran comme une vraie app.

> Plus tard, le serveur Java peut servir lui-même ces fichiers (même adresse que l'API) : plus besoin de `jwebserver`, et pas de souci de CORS.

## API attendue côté serveur Java (Protocole B)

JSON partout. Après `login`, chaque requête envoie `Authorization: Bearer <token>`. Réponse `401` → l'app revient à l'écran de connexion. En cas d'erreur : `{"error": "message lisible"}`.

| Méthode | Route | Corps | Réponse |
|---|---|---|---|
| POST | `/api/login` | `{"username","password"}` | `{"token":"…"}` |
| POST | `/api/logout` | – | `{}` |
| GET | `/api/state` | – | voir ci-dessous |
| POST | `/api/mode` | `{"mode":"AUTO"\|"MANUAL"}` | `{"ok":true}` → envoie `CMD;MODE;…` à l'Arduino |
| POST | `/api/dispense` | `{"portions":2}` | `{"ok":true}` → `CMD;DISPENSE;n=2` |
| PUT | `/api/schedule` | `{"meals":[{"time":"07:00","portions":2}, …]}` | `{"ok":true}` → `CMD;SCHEDULE;07:00=2,…` |
| PUT | `/api/settings` | `{"hungerH":12,"lowPct":20}` | `{"ok":true}` |
| GET | `/api/history?days=30` | – | `{"events":[…]}` |

`GET /api/state` :
```json
{
  "linked": true,
  "mode": "AUTO",
  "level": 62,
  "grams": 1116,
  "passesToday": 14,
  "lastMeal": "2026-11-05T07:00:00Z",
  "lastMealPortions": 2,
  "lastPass": "2026-11-05T11:42:10Z",
  "schedule": [{"time":"07:00","portions":2},{"time":"19:00","portions":2}],
  "settings": {"hungerH":12,"lowPct":20}
}
```
`linked` = l'Arduino est bien relié en USB-série. `grams` est optionnel (sinon calculé : 3 L ≈ 1,8 kg).

Événements de l'historique :
```json
{"t":"2026-11-05T07:00:00Z","type":"MEAL","n":2,"src":"AUTO"}   // src : AUTO | BTN | APP
{"t":"2026-11-05T08:18:00Z","type":"PASS"}
{"t":"2026-11-05T10:00:00Z","type":"ALERT","msg":"Niveau bas (18 %)"}
```

**CORS** : si l'app n'est pas servie par le serveur Java lui-même, il doit répondre aux requêtes `OPTIONS` et ajouter
`Access-Control-Allow-Origin: *`, `Access-Control-Allow-Headers: Content-Type, Authorization`, `Access-Control-Allow-Methods: GET, POST, PUT, OPTIONS`.

## Fichiers

- `index.html`, `style.css` – interface
- `app.js` – logique des écrans
- `api.js` – `HttpApi` (vrai serveur) et `DemoApi` (simulation)
- `manifest.webmanifest`, `sw.js`, `icons/` – installation sur l'écran d'accueil
- `Lancer-Croqi.bat` – sert l'app sur le Wi-Fi local (port 8000)
