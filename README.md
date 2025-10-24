## Prérequis:

- Avoir npm & node d'installé

## Installation de Signalk-server:

- `sudo npm install -g signalk-server`
- `sudo signalk-server-setup` et suivez les instructions de l'installateur (Mettez non pour le ssl sinon ça bloque)
- Parfait signalk-server est installé, il est installé en tant que service donc si jamais vous devez redémarrer le service:
- `sudo systemctl restart signalk.service`
- `localhost:3000` pour se rendre sur signalk

## En cas de bug si vous voulez tout désinstaller:

- `sudo npm uninstall -g signalk-server`
- `rm -rf ~/.signalk`
- `npm cache clean --force`

## Si vous ne pouvez pas build l'app:

- Installez ng si ce n'est pas déjà fait: `npm install -g @angular/cli@latest`
- Oubliez pas de faire un `npm install` la première fois ou si vous rajoutez des librairies
- Si il affiche qu'il y a un problème avec @turf/turf tapez cette commande: `npm install @turf/turf` 
- Ensuite normalement vous pourrez build: `npm run build:web`

## Pour mettre une webapp personnalisée (en particulier freeboard)

- Dupliquez le dépot officiel: `git clone https://github.com/SignalK/freeboard-sk.git`
- Ensuite mettez vous dedans: `cd freeboard-sk/`
- Pour modifier le code et faire votre version personnalisée vous devez aller dans `cd src/app/`
- Tapez `code .` si vous voulez l'ouvrir dans vscode
- À chaque modification vous devez **build** l'app avec cette commande:
- `npm run build:web`
- Il faut ensuite copier le dossier généré (**public**), et le coller dans le nouvel espace freeboard qu'on va créer dans signalk dès maitnenant:
- `cd ~/.signalk/`
- `mkdir /node_modules/`
- `cd node_modules/`
- `sudo mkdir @magellan`
- `cd @magellan`
- `sudo mkdir freeboard-sk-dev`
- `cd freeboard-sk-dev`
- Et voilà c'est ici que sera le dossier **public**
- Maintenant on va pouvoir copier le dossier public qui a été build directement dans ce dossier grâce à ce script sh:

```sh
#!/bin/bash
 
# Définition des chemins source et destination changez les par rapport aux noms que vous avez donné
SRC="/home/tom/freeboard-sk/public"
DEST="/home/tom/.signalk/node_modules/@magellan/freeboard-sk-dev/public"
 
# Vérifie si le dossier source existe
if [ ! -d "$SRC" ]; then
  echo "❌ Le dossier source n'existe pas : $SRC"
  exit 1
fi
 
# Vérifie si le dossier de destination existe
if [ ! -d "$DEST" ]; then
  echo "⚠️ Le dossier de destination n'existe pas, il sera créé."
  mkdir -p "$DEST"
fi
 
# Supprime le dossier de destination existant
echo "🗑 Suppression de l'ancien dossier public..."
rm -rf "$DEST"
 
# Copie le nouveau dossier
echo "📂 Copie du nouveau dossier public..."
cp -r "$SRC" "$DEST"
 
# Vérifie le succès de la copie
if [ $? -eq 0 ]; then
  echo "✅ Dossier public mis à jour avec succès !"
  sudo systemctl restart signalk.service
else
  echo "❌ Erreur lors de la copie du dossier."
  exit 1
fi
```

- Maintenant que vous avez adapté le script selon vos noms de dossiers vous pouvez éxécuter le script:
- `sudo chmod +x ./lenomduscript`
- `./lenomducript`
- Si il y a pas les autorisations: `sudo chown -R tom:tom ~/.signalk`

- Il faut également ajouter à la racine du dossier freeboard-sk-dev le fichier *package.json*
- `sudo nano package.json` remplacez par vos informations si vous avez donné d'autres noms

```json
{
  "name": "@magellan/freeboard-sk-dev",
  "version": "1.0.0",
  "description": "Version de test",
  "signalk": {
    "appIcon": "couach.png",
    "displayName": "Freeboard-SK Dev"
  },
  "keywords": ["signalk-webapp"],
  "author": "Couach",
  "license": "MIT",
  "server": {
    "http":{
      "enableCors": true,
      "allowedOrigins": ["http://127.0.0.1:3000"]
    }
  }
}
```

- Et voilà, faut relancer le serveur: `sudo systemctl restart signalk.service` et maintenant votre web app apparait sur signalk.




