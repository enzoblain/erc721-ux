# TD7 — ERC721 UX 101

Base minimale : Vite + React + TypeScript, avec viem et le provider WalletConnect installés.

## Démarrer

```sh
npm run dev
```

Ouvre l’adresse locale affichée dans le terminal.

## Configuration

Complète `.env.local` avec ton URL RPC Sepolia et ton Project ID WalletConnect quand tu en auras besoin. Les variables `VITE_` sont publiques : ne mets jamais de clé privée ou de phrase de récupération dans ce projet.

## Consignes

Lis [TD.md](./TD.md) pour les exercices, les adresses des contrats et le lien des signatures. La connexion navigateur, la connexion WalletConnect par QR code et le changement vers Sepolia sont implémentés. Le routage et les interactions avec les contrats restent à faire.

WalletConnect utilise directement `@walletconnect/ethereum-provider`, avec `showQrModal: false` et un QR code généré localement par `qrcode`. Aucun connecteur wagmi, RainbowKit ou Web3Modal n’est utilisé.

Avec un wallet navigateur, « Déconnecter » efface la connexion dans l’application ; les autorisations du site se révoquent dans le wallet.

Si `VITE_SEPOLIA_RPC_URL` est vide, un RPC public Sepolia est utilisé. Pour WalletConnect, renseigne ton Project ID et autorise l’origine de développement (par exemple `http://localhost:5173`) dans les paramètres du projet Reown si une liste d’origines est activée.

## Vérification

```sh
npm run build
npm run lint
```

Source du TD : https://github.com/Elli610/Blockchain-101/tree/feat/erc721-ux-101/workshops/solidity/erc721-ux-101
