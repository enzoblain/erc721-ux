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

## Informations réseau

La page `/chain-info` affiche le chainId, l’adresse connectée et le dernier bloc, actualisé toutes les 12 secondes via le provider du wallet. Un wallet connecté sur un autre réseau est redirigé vers `/error`. Après passage sur Sepolia, l’application revient automatiquement à `/chain-info`. Sans wallet connecté, la page propose la connexion.

## FakeBAYC

- `/fakeBayc` : nom et compteur de NFT créés, création depuis le wallet et validation des points.
- `/fakeBayc/123` : image, nom, description et propriétaire du NFT 123 ; état d’erreur pour un NFT inexistant.
- `/fakeBayc/gallery/0x…` : tous les NFT d’une adresse, par pages de 24, avec images chargées à la demande.

Les lectures utilisent le RPC Sepolia. Chaque transaction nécessite une confirmation dans le wallet ; son résultat et son lien Etherscan sont affichés. « Valider mes points » vérifie la possession d’un NFT, propose `submitExercise()` si nécessaire, puis appelle `ex1_claimedFakeBAYC()`. Aucun point n’est annoncé avant confirmation dans l’Evaluator.

## FakeNefturians

`/fakeNefturians` affiche le prix on-chain en ETH et permet d’acheter un NFT. Le prix est relu juste avant la simulation et envoyé comme `value` à `buyAToken()`. Le bouton de validation vérifie le solde, inscrit le wallet si nécessaire, appelle `ex2_boughtFakeNefturians()` et vérifie la progression.

`/fakeNefturians/0x…` liste tous les identifiants détenus par une adresse, par pages de 24, avec un état vide ou une erreur de lecture explicite.

## FakeMeebits

`/fakeMeebits` croise les 100 signatures officielles de `src/fakeMeebits/signatures.json` avec `maxTokenId()` et `tokensThatWereClaimed(tokenId)` du Claimer. La signature correspondante suit automatiquement le NFT sélectionné. La disponibilité est revérifiée et le claim simulé avant l’envoi depuis le wallet, sans pourboire.

Le bouton de validation vérifie la possession d’un FakeMeebits, inscrit le wallet au TD si nécessaire, appelle `ex3_claimedFakeMeebits()` et confirme la progression. Les transactions sont accompagnées de leur état et de leur lien Etherscan.

Source des signatures : https://github.com/Elli610/Blockchain-101/blob/feat/erc721-ux-101/workshops/solidity/erc721-ux-101/signatures/output-sig.json

La page récupère aussi le signataire de chaque signature sélectionnée et vérifie son autorisation dans `whitelist(signer)`. La simulation du 22 octobre 2026 a montré que la signature officielle du token 0 est refusée (« signer not whitelisted ») sur le Claimer fourni. Le bouton est désactivé pour les signatures non autorisées ; une correction des données ou de la configuration par l’enseignant est nécessaire pour ces signatures.

## Transactions et ENS

Le panneau global « Mes transactions » conserve les étapes de toutes les écritures lors de la navigation : vérification, confirmation dans le wallet, attente sur Sepolia, puis succès confirmé ou erreur. Il suit les accélérations et n’annonce pas de succès pour une annulation ou un remplacement par une autre action. Les liens Etherscan restent visibles si la confirmation échoue après l’envoi.

L’identité connectée utilise le nom ENS principal sur Ethereum mainnet si sa résolution directe confirme l’adresse. L’adresse brute reste affichée en l’absence de nom ou en cas de panne ; l’adresse complète est aussi accessible au survol. `VITE_MAINNET_RPC_URL` est facultatif.
