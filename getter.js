
"use strict"

class Getter {
    constructor(client) {
        this.client = client;
    }


    async downloadBlocks(blocks){
        var self = this;

        return new Promise(function(resolve, reject){
            var blockDict = {}; //temp storage for the received blocks

            var receivedBlocks = 0; //how many blocks have been successfully received
            var expectedBlocks = blocks.length;

            console.log("Getter: Downloading " + blocks.length + " blocks starting from block " + blocks[0]);


            var handler = function(err, block){
                if (err) {
                    resolve(null);
                }
                else {

                    if(block == null){
                        console.error("Getter: Received empty block!");
                    } else {
                        blockDict[block.number] = block;
                    }

                    receivedBlocks++;

                    if(receivedBlocks >= expectedBlocks){
                        console.log("Getter: Received all blocks...");
                        resolve(blockDict);
                    }
                }
            }

            self.requestBlocks(blocks, handler);
        }).catch(function(error) {
            console.log("Getter: error caught downloading blocks: " + error);
        });
    }

    //requests blocks from given array of block numbers
    async requestBlocks(blocks, handler){
        var batch = [];
        for(let i=0; i<blocks.length; i++) {
            batch.push({
                method: 'eth_getHeaderByNumber',
                params: ["0x" + blocks[i].toString(16)]
            });
        }
        this.client.cmd(batch, handler);
    }

    async getAll(blocks) {
        return this.downloadBlocks(blocks);
    }
}

module.exports = Getter;

