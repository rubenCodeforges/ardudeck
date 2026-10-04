# Regenerate: python -m venv v && v/bin/pip install dronecan && v/bin/python generate-vectors.py
import json, dronecan
from dronecan import uavcan
from dronecan.transport import Transfer

vectors={}
def add(name, payload, src, dst, tid, prio, service, request):
    t = Transfer(payload=payload, source_node_id=src, dest_node_id=dst, transfer_id=tid,
                 transfer_priority=prio, service_not_message=service, request_not_response=request)
    fr=[{'id': f.message_id, 'data': list(f.bytes)} for f in t.to_frames()]
    # raw serialized payload bytes (with tail-array optimisation applied as on the wire)
    vectors[name]={'frames': fr, 'payload': list(t.payload), 'src': src, 'dst': dst, 'tid': tid, 'prio': prio}

ns = uavcan.protocol.NodeStatus(uptime_sec=12345, health=1, mode=0, sub_mode=2, vendor_specific_status_code=0xBEEF)
add('nodeStatus', ns, 42, None, 7, 16, False, False)

add('getNodeInfoReq', uavcan.protocol.GetNodeInfo.Request(), 127, 42, 3, 30, True, True)
resp = uavcan.protocol.GetNodeInfo.Response()
resp.status = ns
resp.software_version.major=1; resp.software_version.minor=4; resp.software_version.optional_field_flags=1; resp.software_version.vcs_commit=0x1a2b3c4d
resp.hardware_version.major=2; resp.hardware_version.minor=0; resp.hardware_version.unique_id=list(range(16))
resp.name='com.uav-dev.ledmodule'
add('getNodeInfoResp', resp, 42, 127, 3, 30, True, False)

req = uavcan.protocol.param.GetSet.Request(index=5)
add('getSetReqIndex', req, 127, 42, 9, 30, True, True)
req = uavcan.protocol.param.GetSet.Request(name='LED_MODE')
req.value = uavcan.protocol.param.Value(integer_value=2)
add('getSetReqSetInt', req, 127, 42, 10, 30, True, True)
req = uavcan.protocol.param.GetSet.Request(name='LED_BRIGHT')
req.value = uavcan.protocol.param.Value(real_value=0.75)
add('getSetReqSetReal', req, 127, 42, 11, 30, True, True)
req = uavcan.protocol.param.GetSet.Request(name='DEV_NAME')
req.value = uavcan.protocol.param.Value(string_value='nav')
add('getSetReqSetString', req, 127, 42, 12, 30, True, True)

r = uavcan.protocol.param.GetSet.Response(name='LED_MODE')
r.value = uavcan.protocol.param.Value(integer_value=2)
r.default_value = uavcan.protocol.param.Value(integer_value=0)
r.max_value = uavcan.protocol.param.NumericValue(integer_value=3)
r.min_value = uavcan.protocol.param.NumericValue(integer_value=0)
add('getSetRespInt', r, 42, 127, 9, 30, True, False)
r = uavcan.protocol.param.GetSet.Response(name='LED_BRIGHT')
r.value = uavcan.protocol.param.Value(real_value=0.75)
r.default_value = uavcan.protocol.param.Value(real_value=1.0)
r.max_value = uavcan.protocol.param.NumericValue(real_value=1.0)
r.min_value = uavcan.protocol.param.NumericValue(real_value=0.0)
add('getSetRespReal', r, 42, 127, 11, 30, True, False)
r = uavcan.protocol.param.GetSet.Response(name='ARMED_FLASH')
r.value = uavcan.protocol.param.Value(boolean_value=1)
add('getSetRespBool', r, 42, 127, 13, 30, True, False)
r = uavcan.protocol.param.GetSet.Response(name='')
add('getSetRespEmpty', r, 42, 127, 14, 30, True, False)
r = uavcan.protocol.param.GetSet.Response(name='DEV_NAME')
r.value = uavcan.protocol.param.Value(string_value='nav light')
add('getSetRespString', r, 42, 127, 15, 30, True, False)

add('executeOpcodeReq', uavcan.protocol.param.ExecuteOpcode.Request(opcode=0, argument=0), 127, 42, 4, 30, True, True)
add('executeOpcodeResp', uavcan.protocol.param.ExecuteOpcode.Response(argument=0, ok=True), 42, 127, 4, 30, True, False)
add('restartReq', uavcan.protocol.RestartNode.Request(magic_number=0xACCE551B1E), 127, 42, 5, 30, True, True)
add('restartResp', uavcan.protocol.RestartNode.Response(ok=True), 42, 127, 5, 30, True, False)

meta={}
for t in [uavcan.protocol.NodeStatus, uavcan.protocol.GetNodeInfo, uavcan.protocol.param.GetSet, uavcan.protocol.param.ExecuteOpcode, uavcan.protocol.RestartNode]:
    meta[t.full_name]={'dtid': t.default_dtid, 'signature': hex(t.get_data_type_signature())}
json.dump({'types': meta, 'vectors': vectors}, open('dronecan-vectors.json','w'), indent=1)
for k,v in vectors.items(): print(k, len(v['frames']), 'frames', 'payload', len(v['payload']))
