import { Application, FrontendSession } from 'pinus';
import { is_enable_token } from '../../../util/tool';
import { GlobalChannelServiceStatus } from 'pinus-global-channel-status';
import { GAME_TYPE } from '../../../util/enum';

export default function (app: Application) {
    return new Handler(app);
}

export class Handler {

    constructor(private app: Application) {

    }

    /**
     * New client entry.
     *
     * @param  {Object}   msg     request message
     * @param  {Object}   session current session object
     * @return {Void}
     */
    async entry(msg: {uid:number,token:string}, session: FrontendSession) {
        
        let self = this;
        let uid:string = "" + msg.uid;
        let sessionService = self.app.get('sessionService');

        let req = {body:msg};
        if (is_enable_token(req) == false) {
            return {
                code: 501,
                error: true
            };
        }
        // duplicate log in
        if (!!sessionService.getByUid(uid)) {
            return {
                code: 500,
                error: true
            };
        }

        await session.abind(uid);

        const globalChannelStatus: GlobalChannelServiceStatus = this.app.get(GlobalChannelServiceStatus.PLUGIN_NAME);
        globalChannelStatus.addStatus(session.uid, this.app.getServerId());
        session.on('closed', this.onUserLeave.bind(this));

        ////// 加入 全局的游戏通道
        let sids:string[] = await globalChannelStatus.getSidsByUid(""+uid);
        let sid:string = sids[0];
        await globalChannelStatus.add(""+uid,sid,GAME_TYPE.GLOBAL_CHANNEL);
        return {code:0};
    }
    
    /**
     * User log out handler
     *
     * @param {Object} app current application
     * @param {Object} session current session object
     *
     */
    async onUserLeave(session: FrontendSession) {
        if (!session || !session.uid) {
            return;
        }
        const globalChannelStatus: GlobalChannelServiceStatus = this.app.get(GlobalChannelServiceStatus.PLUGIN_NAME);
        /// 通知 所在游戏服务 踢出这人TODO:
        let members = await globalChannelStatus.getMembersByChannelName("connector",GAME_TYPE.MARY_SLOT);
        /**
         * { connector_1:{ channelName1: [ 'uuid_21', 'uuid_12', 'uuid_24', 'uuid_27' ] },
      								connector_2: { channelName1: [ 'uuid_15', 'uuid_9', 'uuid_0', 'uuid_18' ] },
      								connector_3: { channelName1: [ 'uuid_6', 'uuid_3' ] }
         */
        for (const server_id in members) {
            if (members.hasOwnProperty(server_id)) {
                const element = members[server_id];
                for (const channel_name in element) {
                    if (element.hasOwnProperty(channel_name)) {
                        const uids = element[channel_name];
                        if (uids.indexOf(session.uid) != -1) { ///// 通知游戏 该用户掉线
                            await this.app.rpc.mary_slot.marySlotRemoter.outLine.route(session)(session.uid);
                            // await this.app.rpc.mary_slot.marySlotRemoter.outLine.route(null)(session.uid);
                        }
                    }
                }
            }
        }
        
        ////// 离开 全局的游戏通道
        let sids:string[] = await globalChannelStatus.getSidsByUid(session.uid);
        let sid:string = sids[0];
        await globalChannelStatus.leave(""+session.uid,sid,GAME_TYPE.GLOBAL_CHANNEL);

        /// 下线
        globalChannelStatus.leaveStatus(session.uid, this.app.getServerId());
    }

}