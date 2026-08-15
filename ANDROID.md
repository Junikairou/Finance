# L'application Android

Le site est empaqueté en application Android avec [Capacitor](https://capacitorjs.com) :
les trois pages, le CSS et le JavaScript sont **embarqués dans l'APK**. L'application
fonctionne donc sans réseau, et il n'y a **aucun code en double** entre le site et
l'application — `www/` est fabriqué à partir des mêmes fichiers à chaque compilation.

| | |
| --- | --- |
| Nom affiché | Boule de neige |
| Nom de paquet | `com.junikairou.bouledeneige` |
| Version | celle de `package.json` (1.2.3 → versionCode 10203) |
| Android minimum | 6.0 (API 23) |
| Téléchargement | https://github.com/Junikairou/Finance/releases/download/apk/boule-de-neige.apk |

## Installer l'APK sur le téléphone

1. Ouvrir **depuis le téléphone** la page des Releases du dépôt, section « Assets ».
2. Télécharger `boule-de-neige.apk`, puis ouvrir le fichier téléchargé.
3. Android demande une fois l'autorisation d'installer depuis cette source : l'accorder.

L'adresse ne change jamais (le tag `apk` est réécrit à chaque compilation), et toutes
les compilations sont signées avec **la même clé de débogage**, versionnée dans le dépôt
(`android/app/boule-debug.keystore`). Une nouvelle version remplace donc l'ancienne sans
la désinstaller, et sans perdre les paramètres enregistrés. Si le dépôt est privé, il faut
être connecté à GitHub dans le navigateur du téléphone pour que le téléchargement aboutisse.

## Fabriquer un nouvel APK

Rien à installer : la compilation se fait sur GitHub.

- **Sur `main`** : chaque push déclenche le workflow `.github/workflows/apk.yml`.
- **Sur une autre branche** : lancer le workflow à la main (onglet *Actions* → *APK* →
  *Run workflow*, en choisissant la branche). Compter environ quatre minutes.

Le workflow lance `npm test`, compile, **vérifie que l'APK porte bien l'empreinte de la clé
du dépôt**, puis remplace la Release `apk`. Son titre est le sujet du dernier commit et ses
notes en sont le corps : c'est ce texte que l'on lit sur le téléphone.

## Compiler sur sa machine

Il faut un JDK 21 (Gradle 8.11 refuse les JDK plus récents) et le SDK Android :

```
npm ci
npm run sync                 # fabrique www/ puis le recopie dans le projet Android
cd android && ./gradlew assembleDebug
```

L'APK sort dans `android/app/build/outputs/apk/debug/app-debug.apk`.

## Ce qui diffère entre le site et l'application

Un seul fichier : `assets/natif.js`, inséré dans les pages par `tools/build-www.js` et
donc présent **uniquement** dans l'APK. Il pose `<html data-natif="1">` et branche le
bouton retour d'Android — reculer d'une page tant qu'il y en a une, puis mettre
l'application en arrière-plan au lieu de la fermer.

## Pièges connus

- **Ressources Android** : une apostrophe non échappée dans `values/strings.xml`, ou deux
  tirets d'affilée dans un commentaire XML, font échouer la compilation avec un message qui
  ne nomme ni le fichier ni la ligne. `npm test` relit tous les fichiers XML et les nomme —
  **à lancer avant tout commit touchant à `android/app/src/main/res/`**.
- **Clé de signature** : sans le bloc `signingConfigs.debug` de `android/app/build.gradle`,
  Gradle signerait avec une clé fabriquée au hasard sur chaque machine, et le téléphone
  refuserait la mise à jour (« Application non installée »). Le workflow compare les
  empreintes et échoue plutôt que de publier un APK non installable.
- **Icône** : le flocon est une icône adaptative vectorielle (Android 8 et plus). Sur
  Android 6 et 7, c'est encore l'icône par défaut de Capacitor, faute de PNG dédiés.
- **Play Store** : impossible avec cette build, qui est une build de débogage. Une
  publication demanderait une clé de signature personnelle et un compte développeur.
