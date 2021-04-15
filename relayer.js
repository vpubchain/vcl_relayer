#!/usr/bin/env node

const Web3 = require('web3');
const request = require('request');
const fs = require('fs');
const util = require('util');
const Getter = require('./getter.js');
const ethcoin = require('node-eth-rpc');
/* 
 *  Usage:  Subscribe to Geth node and push header to syscoin via RPC 
 *
 */
/* Retrieve arguments */
let argv = require('yargs')
    .usage('Usage: $0 -datadir [syscoin data dir] -sysrpcusercolonpass [user:password] -sysrpcport [port] -ethwsport [port] -ethrpcport [port]')
    .default("sysrpcport", 8370)
    .default("ethwsport", 8646)
    .default("ethrpcport", 8645)
    .default("sysrpcusercolonpass", "u:p")
    .default("datadir", "~/.syscoin/geth")
    .argv
;
if (argv.sysrpcport < 0 || argv.sysrpcport > 65535) {
    console.log('Invalid Syscoin RPC port');
    exit();
}
if (argv.ethwsport < 0 || argv.ethwsport > 65535) {aq
    console.log('Invalid Geth Websocket port');
    exit();
}
if (argv.ethrpcport < 0 || argv.ethrpcport > 65535) {
    console.log('Invalid Geth RPC port');
    exit();
}
const sysrpcport = argv.sysrpcport;
const ethwsport = argv.ethwsport;
const ethrpcport = argv.ethrpcport;
const sysrpcuserpass = argv.sysrpcusercolonpass.split(":");
const datadir = argv.datadir;
if (!fs.existsSync(datadir)){
    fs.mkdirSync(datadir, { recursive: true });
}
/* Set up logging */
var logFile = fs.createWriteStream(datadir + '/syscoin-relayer.log', { flags: 'a' });
var logStdout = process.stdout;

console.log = function () {
    var date = new Date().toISOString();
    logFile.write(date + ' '  + util.format.apply(null, arguments) + '\n');
    logStdout.write(date + ' ' + util.format.apply(null, arguments) + '\n');
}
console.error = console.log;

console.log("Running V1.0.23 version of the Syscoin relay logger! This tool pushed headers from Ethereum to Syscoin for consensus verification of SPV proofs of Syscoin Mint transactions.");

/* Initialize Geth Web3 */
// var geth_ws_url = "ws://127.0.0.1:" + ethwsport;
// var geth_ws_url = "wss://mainnet.infura.io/ws/v3/6d014b1c22c6418fbe11e78e3097fe1b";

//for test
var geth_ws_url = "ws://161.189.223.132:" + ethwsport;

var web3 = new Web3(geth_ws_url);
var subscriptionSync = null;
var subscriptionHeader = null;

/* Global Arrays */
var collection = [];
var missingBlocks = [];
var fetchingBlocks = [];

/* Global Variables */
var highestBlock = 0;
var currentBlock = 0; 
var currentState = "syncing";
var timediff = 0;
var currentWeb3 = null;
var timeOutProvider = null;
var missingBlockChunkSize = 5000;
// var client = new ethcoin.Client({
//     host: 'localhost',
//     port: ethrpcport,
//     user: '',
//     pass: ''
//   });

// var client = new ethcoin.Client({
//     host: 'mainnet.infura.io',
//     port: 443,
//     path: '/v3/:6d014b1c22c6418fbe11e78e3097fe1b'
//   });

//for test
var client = new ethcoin.Client({
    host: '161.189.223.132',
    port: ethrpcport,
    user: '',
    pass: ''
  });

//check client is connect ?
console.log("---debug: begin checkout client is work?---\n");
client.cmd('personal_listAccounts', function(err, accounts){
    if (err) return console.log(err);
    console.log('personal_listAccounts:', accounts);
});

client.cmd('eth_blockNumber', function(err, blockNumber){
    if (err) return console.log(err);
    console.log('eth_blockNumber:', blockNumber);
});

console.log("---debug: end checkout client is work?---\n");

var getter = new Getter(client);
SetupListener(web3);
// once a minute call eth status regardless of internal state
setInterval(RPCsetethstatus, 60000);
async function RPCsetethstatus () {
    if(currentState !== "" || highestBlock != 0 && missingBlocks.length <= 0){
        await RPCsyscoinsetethstatus([currentState, highestBlock]);
    }
}
function SetupListener(web3In) {
    var provider = new Web3.providers.WebsocketProvider(geth_ws_url);
    

    provider.on("error", err => {
        console.log("SetupListener: web3 socket error\n")
    });

    provider.on("end", err => {
        // Attempt to try to reconnect every 3 seconds
        console.log("SetupListener: web3 socket ended.  Retrying...\n");
        timeOutProvider = setTimeout(function () {
            SetupListener(web3In);
        }, 3000);
    });

    provider.on("connect", function () {
        console.log("SetupListener: web3 connected");
        SetupSubscriber();
    });
    cancelSubscriptions();
    currentWeb3 = web3In;
    if (timeOutProvider != null) {
        clearTimeout(timeOutProvider);
        timeOutProvider = null;
    }

    console.log("SetupListener: Currently using local geth");
    
    web3In.setProvider(provider);
}

/* Timer for submitting header lists to Syscoin via RPC */
setInterval(updateHeadersAndStatus, 5000);
async function updateHeadersAndStatus(){
    if(missingBlocks.length > 0)
        return;
    await RPCsyscoinsetethheaders();
    if (highestBlock != 0 && currentBlock >= highestBlock && timediff < 600) {
        highestBlock = currentBlock;
        await RPCsetethstatus();
        timediff = 0;
    }
}
async function updateHeadersAndStatusManual(){
    await RPCsyscoinsetethheaders();
    await RPCsyscoinsetethstatus([currentState, highestBlock]);
    timediff = 0;
}
async function RPCsyscoinsetethheaders() {
    // Check if there's anything in the collection
    if (collection.length == 0) {
        // console.log("collection is empty");
        return;
    }

    // Request options
    let options = {
        url: "http://localhost:" + sysrpcport,
        method: "post",
        headers:
        {
            "content-type": "application/json" 	
        },
        auth: {
            user: sysrpcuserpass[0],
            pass: sysrpcuserpass[1] 
        },
        body: JSON.stringify( {"jsonrpc": "2.0", "id": "ethheader_update", "method": "syscoinsetethheaders", "params": [collection]})
    };

    return request(options, async (error, response, body) => {
        if (error) {
            console.error('RPCsyscoinsetethheaders: An error has occurred during request: ', error);
        } else if (collection.length > 1){
            console.log("RPCsyscoinsetethheaders: Successfully pushed " + collection.length + " headers to Syscoin Core");
            collection = [];
        }
    });

};

missingBlockTimer = setTimeout(retrieveBlock, 3000);
async function retrieveBlock() {
    try {
        if(missingBlocks.length > 0){
            let fetchingBlock = getNextRangeToDownload();
            if(fetchingBlock.length <= 0){
                console.log("retrieveBlock: Nothing to fetch!");
                missingBlocks = [];
                fetchingBlocks = [];
                missingBlockTimer = setTimeout(retrieveBlock, 3000);
                return;
            }
            let fetchedBlocks = await getter.getAll(fetchingBlock);
            if(!fetchedBlocks || fetchedBlocks.length <= 0){
                console.log("retrieveBlock: Could not fetch range...");
            }
            for (var key in fetchedBlocks) {
                var result = fetchedBlocks[key];
                var obj = [parseInt(result.number),result.hash,result.parentHash,result.transactionsRoot,result.receiptsRoot,parseInt(result.timestamp)];
                collection.push(obj);
            }

            await updateHeadersAndStatusManual();
            
            missingBlockTimer = setTimeout(retrieveBlock, 50);
        }
        else {	
            missingBlockTimer = setTimeout(retrieveBlock, 3000);
        }
    } catch (e) {
        missingBlockTimer = setTimeout(retrieveBlock, 3000);
    }
};


function getMissingBlockAmount(rawMissingBlocks) {
    var amount = 0;
    for(var i=0; i<rawMissingBlocks.length; i++) {
        var from = rawMissingBlocks[i].from;
        var to = rawMissingBlocks[i].to;		
        var blockDiff = (to - from) + 1;
        amount += blockDiff;	
    }
    return amount;
}
function getNextRangeToDownload(){
    var range = [];
    var breakout = false;
    for(var i =0;i<missingBlocks.length;i++){
        if(breakout) { 
            break;
        }
        for(var j =missingBlocks[i].from;j<=missingBlocks[i].to;j++){
            if(!fetchingBlocks.includes(j)){
                fetchingBlocks.push(j);
                range.push(j);
                if(range.length >= missingBlockChunkSize){
                    breakout = true;
                    break;
                }
            }
        }
    }
    return range;
}
async function RPCsyscoinsetethstatus(params) {
    let options = {
        url: "http://localhost:" + sysrpcport,
        method: "post",
        headers:
        {
            "content-type": "application/json"
        },
        auth: {
            user: sysrpcuserpass[0],
            pass: sysrpcuserpass[1] 
        },
        body: JSON.stringify( {
            "jsonrpc": "2.0", 
            "id": "eth_sync_update", 
            "method": "syscoinsetethstatus",
            "params": params})
    };

    return request(options, async (error, response, body) => {
        if (error) {
            console.error('RPCsyscoinsetethstatus: An error has occurred during request: ', error);
        } else {
            var parsedBody = JSON.parse(body);
            if (parsedBody != null) {
                var rawMissingBlocks = parsedBody.result.missing_blocks;
                if(missingBlocks.length <= 0){
                    missingBlocks = rawMissingBlocks;
                    fetchingBlocks = [];
                    if (missingBlocks.length > 0) {
                        console.log("RPCsyscoinsetethstatus: missingBlocks count: " + getMissingBlockAmount(missingBlocks));
                    }
                }
            }
        }
    });
};

function SetupSubscriber() {
    /* Subscription for Geth incoming new block headers */
    cancelSubscriptions();

    console.log("SetupSubscriber: Subscribing to newBlockHeaders");
    subscriptionHeader = currentWeb3.eth.subscribe('newBlockHeaders', (error, blockHeader) => {
        if (error) return console.error("SetupSubscriber:" + error);
        if (blockHeader['number'] > currentBlock) {
            currentBlock = blockHeader['number'];
        }
        if (currentBlock > highestBlock) {
            highestBlock = currentBlock;
        }
        let obj = [blockHeader['number'],blockHeader['hash'],blockHeader['parentHash'],blockHeader['transactionsRoot'],blockHeader['receiptsRoot'],blockHeader['timestamp']];
        collection.push(obj);
        // Check blockheight and timestamp to notify synced status
        timediff = new Date() / 1000 - blockHeader['timestamp'];
        if(timediff < 600){
            currentState = "synced";
        }
    });
};

function cancelSubscriptions () {
    if (subscriptionHeader != null) {
        subscriptionHeader.unsubscribe(function(error, success){
            if(success)
                console.log('Successfully unsubscribed from newBlockHeaders!');
        });
    }
    if (subscriptionSync != null) {
        subscriptionSync.unsubscribe(function(error, success){
            if(success)
                console.log('Successfully unsubscribed from sync!');
        });
    }
    subscriptionHeader = null;
    subscriptionSync = null;
}
