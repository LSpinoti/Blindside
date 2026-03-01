// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {BinaryPriceMarket} from "../src/BinaryPriceMarket.sol";

interface Vm {
    function startBroadcast() external;
    function stopBroadcast() external;
    function envUint(string calldata name) external returns (uint256);
    function serializeAddress(
        string calldata objectKey,
        string calldata valueKey,
        address value
    ) external returns (string memory json);
    function writeJson(string calldata json, string calldata path) external;
    function projectRoot() external view returns (string memory);
}

contract DeployBlindsideMarketsScript {
    Vm private constant VM =
        Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    address private constant PYTH_PRIMARY =
        0x2880aB155794e7179c9eE2e38200202908C17B43;
    uint64 private constant HOURLY_DURATION = 1 hours;

    function run()
        external
        returns (
            BinaryPriceMarket btc,
            BinaryPriceMarket eth,
            BinaryPriceMarket sol,
            BinaryPriceMarket xrp
        )
    {
        uint64 initialCutoff = _nextHourlyCutoff();
        int64 btcStrike = _envStrike("BLINDSIDE_BTC_INITIAL_STRIKE_E8");
        int64 ethStrike = _envStrike("BLINDSIDE_ETH_INITIAL_STRIKE_E8");
        int64 solStrike = _envStrike("BLINDSIDE_SOL_INITIAL_STRIKE_E8");
        int64 xrpStrike = _envStrike("BLINDSIDE_XRP_INITIAL_STRIKE_E8");

        VM.startBroadcast();

        btc = new BinaryPriceMarket(
            "Will BTC/USD close above its opening price this UTC hour?",
            btcStrike,
            initialCutoff,
            PYTH_PRIMARY,
            0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43
        );

        eth = new BinaryPriceMarket(
            "Will ETH/USD close above its opening price this UTC hour?",
            ethStrike,
            initialCutoff,
            PYTH_PRIMARY,
            0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace
        );

        sol = new BinaryPriceMarket(
            "Will SOL/USD close above its opening price this UTC hour?",
            solStrike,
            initialCutoff,
            PYTH_PRIMARY,
            0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d
        );

        xrp = new BinaryPriceMarket(
            "Will XRP/USD close above its opening price this UTC hour?",
            xrpStrike,
            initialCutoff,
            PYTH_PRIMARY,
            0xec5d399846a9209f3fe5881d70aae9268c94339ff9817e8d18ff19fa05eea1c8
        );

        VM.stopBroadcast();

        string memory deploymentKey = "trackedMarkets";
        VM.serializeAddress(deploymentKey, "btc", address(btc));
        VM.serializeAddress(deploymentKey, "eth", address(eth));
        VM.serializeAddress(deploymentKey, "sol", address(sol));
        string memory json = VM.serializeAddress(
            deploymentKey,
            "xrp",
            address(xrp)
        );

        VM.writeJson(
            json,
            string.concat(
                VM.projectRoot(),
                "/deployments/tracked-markets.json"
            )
        );
    }

    function _nextHourlyCutoff() internal view returns (uint64) {
        uint256 nextCutoff = ((block.timestamp / HOURLY_DURATION) + 1) *
            HOURLY_DURATION;

        // forge-lint: disable-next-line(unsafe-typecast)
        return uint64(nextCutoff);
    }

    function _envStrike(string memory key) internal returns (int64) {
        uint256 rawStrike = VM.envUint(key);
        require(rawStrike > 0, "invalid strike");
        require(rawStrike <= uint256(uint64(type(int64).max)), "strike overflow");

        // forge-lint: disable-next-line(unsafe-typecast)
        return int64(uint64(rawStrike));
    }
}
