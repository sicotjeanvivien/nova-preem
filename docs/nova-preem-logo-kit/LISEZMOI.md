# Nova Preem — kit logo (C4 « Carte tirée », Corail + T2)

## Couleurs
| Rôle | Hex |
|---|---|
| Accent (carte rare) | #FF4D3D |
| Fond sombre | #0E0F14 |
| Cases remplies (sombre) | #EDEAE3 |
| Cases vides (sombre) | #3A3C46 |
| Fond clair | #F2F0EA |
| Cases vides (clair) | #C9C6BC |

Typo : Oxanium — **NOVA** en 800, PREEM en 500 (gris #9A9AA3 sur sombre, #55565E sur clair), interlettrage 0.04em.

## Contenu
- `svg/` : symbole (fond sombre / fond clair), icône carrée, icône maskable, logo complet.
  Le contour autour de la carte rare prend la couleur du fond : utiliser la version qui correspond au fond.
  Les SVG du logo complet utilisent la police Oxanium (chargée depuis Google Fonts) : texte non vectorisé.
- `web/` : à copier dans `public/` de la PWA — favicon.ico, favicon.svg, apple-touch-icon.png,
  icônes 192/512 normales et maskable, et `manifest-icons.json` à fusionner dans le manifest.
- `play/playstore-icon-512.png` : icône haute résolution pour la fiche Play Store (TWA).
- `react/NovaPreemLogo.tsx` : composant React (symbole seul ou avec le nom, thème sombre/clair).

## Dans index.html
```html
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta name="theme-color" content="#0E0F14">
```
