const splToken = require("@solana/spl-token")
const web3 = require('@solana/web3.js')
const anchor = require('@project-serum/anchor');
const { SystemProgram } = anchor.web3;

const TOKEN_METADATA_PROGRAM_ID = new anchor.web3.PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"); //On Solana, NFT metadata is stored in accounts which are owned by the shared contract Token Metadata Program at address metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s. https://stackoverflow.com/questions/69152527/code-sample-for-parsing-metadata-for-solana-nft-and-updating-the-metadata 

const getMetadataAddress = async (mint) => {
  // With Metaplex, the Metadata account address (a.k.a. its Public Key) is derived from the associated Mint Account address.
  // This is the logic to construct it.
  // Note: Other tutorial simply might call it `getMetadata`.
  return (
    await anchor.web3.PublicKey.findProgramAddress(
      [
        Buffer.from("metadata"),
        TOKEN_METADATA_PROGRAM_ID.toBuffer(),
        mint.toBuffer(),
      ],
      TOKEN_METADATA_PROGRAM_ID
    )
  )[0];
};

const getMasterEditionAddress = async (mint) => {
  // With Metaplex, the Master Edition address (a.k.a. its Public Key) is derived from the associated Mint Account address.
  // This is the logic to construct it.
  // Note: Other tutorial might simply call it `getMasterEdition`.
  // Note: With Metaplex, the Master Edition and the copy Edition have the same address. That means: 1. we use the same method to get the Edition address ; 2. An NFT is either a Master Edition or an Edition but cannot be both at the same time.
  return (
    await anchor.web3.PublicKey.findProgramAddress(
      [
        Buffer.from("metadata"),
        TOKEN_METADATA_PROGRAM_ID.toBuffer(),
        mint.toBuffer(),
        Buffer.from("edition"),
      ],
      TOKEN_METADATA_PROGRAM_ID
    )
  )[0];
};


const getMarker = async (mint) => { 
  return (
    await anchor.web3.PublicKey.findProgramAddress(
      [
        Buffer.from("metadata"),
        TOKEN_METADATA_PROGRAM_ID.toBuffer(),
        mint.toBuffer(),
        Buffer.from("edition"),
        Buffer.from("0")
      ],
      TOKEN_METADATA_PROGRAM_ID
    )
  )[0];
};

const main = async () => {

  // Step 1. Define generic variables

  // As per anchor documentation, the provider provides "the network and wallet context used to send transactions paid for and signed".
  // Anchor will use the default wallet of our environment to sign the transactions. Should we need to sign the transactions with another wallet, we need to pass the signer explicitely.
  // See in the code below for an example of manually passed "signers".
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  console.log("Provider wallet: ", provider.wallet.publicKey.toString());

  // Here we connect to Solana's devnet
  const network = "https://api.devnet.solana.com";
  const connection = new web3.Connection(network, "processed");

  // We get the minimum balance for rent exemption for when we create the accounts.
  const lamports = await connection.getMinimumBalanceForRentExemption(splToken.MINT_SIZE);


  // Step 2. we want to test our program by creating a Master Edition NFT.
  
  // Step 2.1. First, we specify our program to test
  const program = anchor.workspace.EditionFromMasterEditionExample;

  // In order to mint the Master Edition NFT, we need:
  // - a Mint account
  // - the Token account associated to the Mint account
  // - the Metadata account associated to the Mint account

  // Step 2.2. We create a new Mint account and the associated Token account. 
  // The Mint account address is newly generated, while the token account address is constructed from the Mint account address and the wallet that will be the owner of the Mint account. 
  // The Token account address is called a PDA (Program Derived Address).
  const mintKey = anchor.web3.Keypair.generate();
  const NftTokenAccount = await splToken.getAssociatedTokenAddress(mintKey.publicKey, program.provider.wallet.publicKey);

  // We send a transaction the Solana Token program to create the two accounts (Mint account and Token account).
  const mint_tx = new anchor.web3.Transaction().add(
    anchor.web3.SystemProgram.createAccount({
      fromPubkey: program.provider.wallet.publicKey,
      newAccountPubkey: mintKey.publicKey,
      space: splToken.MINT_SIZE,
      programId: splToken.TOKEN_PROGRAM_ID,
      lamports,
    }),

    splToken.createInitializeMintInstruction(
      mintKey.publicKey,
      0,
      program.provider.wallet.publicKey,
      program.provider.wallet.publicKey
    ),

    splToken.createAssociatedTokenAccountInstruction(
      program.provider.wallet.publicKey,
      NftTokenAccount,
      program.provider.wallet.publicKey,
      mintKey.publicKey
    )
  );
  const res = await anchor.web3.sendAndConfirmTransaction(connection, mint_tx, [provider.wallet.payer, mintKey]);
  console.log("Account creations transactions", res)
  console.log("Mint account: ", mintKey.publicKey.toString());
  console.log("Token Account: ", NftTokenAccount.toBase58());

  // Step 2.3. We get the Metadata account address.
  // Similar to the Token account, the Metadata account address is derived from the Mint account address.
  // Contrary to the Mint account and Token account, we do not need to create the Metadata account. We only need the address.
  // The Metadata account will be created by the program itself.
  const metadataAddress = await getMetadataAddress(mintKey.publicKey);
  console.log("Metadata address: ", metadataAddress.toBase58());
  
  // Step 2.4. We get the Master Edition account address
  // Similar to the Token account and the Metadata account, the Master Edition account address is derived from the Mint account address.
  // Similarly to the Metadata account, we only need the account address.
  // The Master Edition account will be created by the program itself.
  const masterEdition = await getMasterEditionAddress(mintKey.publicKey);
  console.log("MasterEdition: ", masterEdition.toBase58());

  // Step 2.5. We create the Master Edition account by calling our program endpoint `createMasterEdition`.
  const tx = await program.rpc.createMasterEdition(
    mintKey.publicKey,
    "https://public.do-your-own-research.com/nft/donut-nft-2022.json", // Change it to your own metadata json file.
    "Hmmm, a donut", // Change it to your own NFT title
    {
      accounts: {
        mintAuthority: program.provider.wallet.publicKey,
        mint: mintKey.publicKey,
        tokenAccount: NftTokenAccount,
        tokenProgram: splToken.TOKEN_PROGRAM_ID,
        metadata: metadataAddress,
        tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
        payer: program.provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        masterEdition: masterEdition,
      },
    }
  );
  
  console.log("Master Edition creation, transaction signature", tx);
  // Step 2. is over. We have created a Master Edition NFT.

  // Step 3. We create an Edition NFT copy of the Master Edition in another wallet.
  // To do so, we need an initialized wallet and associated token account without any token. 
  
  // Step 3.1. We generate a new wallet (toWallet) that will receive the Edition NFT.   
  // We airdrop Sol to the wallet so that it can pay the fees later on.
  const toWallet = anchor.web3.Keypair.generate();

  let airdropSignature = await connection.requestAirdrop(
    toWallet.publicKey,
    web3.LAMPORTS_PER_SOL * 2,
  );

  const latestBlockHash = await connection.getLatestBlockhash();

  await connection.confirmTransaction({
    blockhash: latestBlockHash.blockhash,
    lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
    signature: airdropSignature,
  })
  console.log("toWallet created: ", toWallet.publicKey.toString());
  console.log("Airdrop done: ", airdropSignature)
  // New wallet created with Sol airdrop

  // Step 3.2. We create a new Mint account and the associated Token account.
  const toWalletMintKey = anchor.web3.Keypair.generate();
  const toWalletNftTokenAccount = await splToken.getAssociatedTokenAddress(toWalletMintKey.publicKey, toWallet.publicKey); // The Token account address is derived from the Mint account address

  const new_mint_tx = new anchor.web3.Transaction().add( // The transaction to initialize the Mint account and the Token account
    anchor.web3.SystemProgram.createAccount({
      fromPubkey: toWallet.publicKey,
      newAccountPubkey: toWalletMintKey.publicKey, 
      space: splToken.MINT_SIZE,
      programId: splToken.TOKEN_PROGRAM_ID,
      lamports,
    }),

    splToken.createInitializeMintInstruction( 
      toWalletMintKey.publicKey,
      0,
      toWallet.publicKey,
      toWallet.publicKey,
    ),

    splToken.createAssociatedTokenAccountInstruction(
      toWallet.publicKey, 
      toWalletNftTokenAccount,
      toWallet.publicKey,
      toWalletMintKey.publicKey
    )
  );

  const new_res = await anchor.web3.sendAndConfirmTransaction(connection, new_mint_tx, [toWallet, toWalletMintKey]);
  console.log("New Mint key: ", toWalletMintKey.publicKey.toString());
  console.log("New Token Account: ", toWalletNftTokenAccount.toBase58());
  // Mint account and Token account created

  // Step 3.3. We derive the Metadata account address from the Mint account address. The account will be created later by the program.
  const newMetadataAddress = await getMetadataAddress(toWalletMintKey.publicKey);
  console.log("New Metadata address: ", newMetadataAddress.toBase58());

  // Step 3.4. We derive the Edition account address from the Mint account address. The account will be created later by the program.
  const newEditionAddress = await getMasterEditionAddress(toWalletMintKey.publicKey); 
  console.log("New Edition: ", newEditionAddress.toBase58());
  
  // Step 3.5. We derive the Marker from the Mint account address.
  const newEditionMarker = await getMarker(mintKey.publicKey)
  console.log("New Edition Marker", newEditionMarker.toBase58())

  // Step 3.6. We call our program to mint (a.k.a create) the Edition NFT.
  const new_tx = await program.rpc.createNewEditionNft(
    new anchor.BN(3), // The edition number of the Edition NFT. It should not have been used already.
    {
      accounts: {
        newEdition: newEditionAddress,
        newMetadata: newMetadataAddress,
        masterEdition: masterEdition,
        newMint: toWalletMintKey.publicKey,
        newMintAuthority: toWallet.publicKey,
        payer: toWallet.publicKey, 
        tokenAccountOwner: program.provider.wallet.publicKey,
        tokenAccount: NftTokenAccount, 
        newTokenAccount: toWalletNftTokenAccount,
        newMetadataUpdateAuthority: toWallet.publicKey,
        metadata: metadataAddress,
        metadataMint: mintKey.publicKey, 
        tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
        tokenProgram: splToken.TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        marker: newEditionMarker
      },
      signers: [toWallet] // We add the new wallet `toWaller` as a signer of the transaction. The wallet of the provider will automatically be added as a signer of the transaction. 
    },
  );
  console.log("Your transaction signature", new_tx);
  // Step 3. is over. That's it, we have created and Edition copy of the Master Edition NFT and the new wallet `toWallet` is the owner.
}

// Code block to run the main function
const runMain = async () => {
  try {
    await main();
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

runMain();