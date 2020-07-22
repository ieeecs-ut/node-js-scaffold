var wss = {
    socket: new websocket.Server({
        port: wss_port
    }),
    online: false,
    clients: {}, // client sockets
    events: {}, // event handlers
    // encode event+data to JSON
    encode_msg: (e, d) => {
        return JSON.stringify({
            event: e,
            data: d
        });
    },
    // decode event+data from JSON
    decode_msg: (m) => {
        try {
            m = JSON.parse(m);
        } catch (e) {
            util.log("ws", util.ERR, "invalid json msg", e);
            m = null;
        }
        return m;
    },
    // send data to specific authenticated client
    send_to_client: (event, data, client) => {
        client.socket.send(wss.encode_msg(event, data));
    },
    // send event to device
    send_to_device: (event, data, client) => {
        client.socket.send(`@${event}-${data}`);
    },
    // send data to all authenticated clients in group
    send_to_group: (event, data, group) => {
        for (var c_id in wss.clients) {
            if (
                wss.clients.hasOwnProperty(c_id) &&
                wss.clients[c_id] !== null &&
                wss.clients[c_id].auth &&
                wss.clients[c_id].type == group
            ) {
                wss.clients[c_id].socket.send(wss.encode_msg(event, data));
            }
        }
    },
    // send text to all authenticated clients in group
    send_to_device_group: (event, data, group) => {
        for (var c_id in wss.clients) {
            if (
                wss.clients.hasOwnProperty(c_id) &&
                wss.clients[c_id] !== null &&
                wss.clients[c_id].auth &&
                wss.clients[c_id].type == group
            ) {
                wss.clients[c_id].socket.send(`@${event}-${data}`);
            }
        }
    },
    // send data to all authenticated clients for user
    send_to_user: (event, data, user_id) => {
        for (var c_id in wss.clients) {
            if (
                wss.clients.hasOwnProperty(c_id) &&
                wss.clients[c_id] !== null &&
                wss.clients[c_id].auth &&
                wss.clients[c_id].o_id == user_id
            ) {
                wss.clients[c_id].socket.send(wss.encode_msg(event, data));
            }
        }
    },
    // send data to specific authenticated client
    trigger_for_client: (event, data, client) => {
        wss.events[event](client, data, database.mdb);
    },
    // trigger event for all authenticated clients for user
    trigger_for_user: (event, data, user_id) => {
        for (var c_id in wss.clients) {
            if (
                wss.clients.hasOwnProperty(c_id) &&
                wss.clients[c_id] !== null &&
                wss.clients[c_id].auth &&
                wss.clients[c_id].o_id == user_id
            ) {
                wss.events[event](wss.clients[c_id], data, database.mdb);
            }
        }
    },
    // trigger event for all authenticated clients for user (except one)
    trigger_for_user_except: (event, data, user_id, except_client_id) => {
        for (var c_id in wss.clients) {
            if (
                wss.clients.hasOwnProperty(c_id) &&
                wss.clients[c_id] !== null &&
                wss.clients[c_id].auth &&
                wss.clients[c_id].o_id == user_id &&
                c_id != except_client_id
            ) {
                wss.events[event](wss.clients[c_id], data, database.mdb);
            }
        }
    },
    // bind handler to client event
    bind: (event, handler, auth_req = true) => {
        wss.events[event] = (client, req, db) => {
            if (!auth_req || client.auth)
                handler(client, req, db);
        };
    },
    // initialize & attach events
    init: _ => {
        // attach server socket events
        wss.socket.on("connection", (client_socket) => {
            // create client object on new connection
            var client = {
                socket: client_socket,
                id: "_c_" + util.rand_id(),
                o_id: null,
                auth: false,
                type: "app"
            };
            util.log("ws", util.INF, `client ${client.id} – connected`);
            // client socket event handlers
            client.socket.addEventListener("message", (m) => {
                var d = wss.decode_msg(m.data); // parse message
                if (d != null) {
                    // console.log('    ', d.event, d.data);
                    util.log("ws", util.EXT, `client ${client.id} – message: ${d.event}`, d.data);
                    // handle various events
                    if (wss.events.hasOwnProperty(d.event))
                        wss.events[d.event](client, d.data, database.mdb);
                    else util.log("ws", util.ERR, "unknown event", d.event);
                } else util.log("ws", util.ERR, `client ${client.id} – invalid message: `, m.data);
            });
            client.socket.addEventListener("error", (e) => {
                util.log("ws", util.ERR, "client " + client.id + " – error", e);
            });
            client.socket.addEventListener("close", (c, r) => {
                util.log("ws", util.INF, `client ${client.id} – disconnected`);
                delete wss.clients[client.id]; // remove client object on disconnect
            });
            // add client object to client object list
            wss.clients[client.id] = client;
        });
        wss.socket.on("listening", _ => {
            util.log("ws", util.IMP, "listening on", wss_port);
            wss.online = true;
        });
        wss.socket.on("error", (e) => {
            util.log("ws", util.ERR, "server error", e);
            wss.online = false;
        });
        wss.socket.on("close", _ => {
            util.log("ws", util.IMP, "server closed");
            wss.online = false;
        });

        /* bind events */

        // client: web panel
        wss.bind('auth', (client, req, db) => {
            // validate credentials
            db.collection('users').findOne({ username: req.username, password: req.password }, (err, item) => {
                if (err) util.log("mdb", util.ERR, `${client.id} error - login validation`, err);
                else {
                    if (item == null)
                        wss.send_to_client("auth", false, client);
                    else {
                        client.o_id = item._id.toString();
                        client.auth = true;
                        wss.send_to_client("auth", true, client);
                        util.log("ws", util.INF, `client ${client.id} authenticated as user ${client.o_id}`);
                        var node_profiles = {};
                        for (var nd in app.node_drivers)
                            node_profiles[nd] = app.node_drivers[nd].data;
                        wss.send_to_client("node_profiles", node_profiles, client);
                    }
                }
            });
        }, false);
        wss.bind('new_core', (client, req, db) => {
            var mdb_cores = db.collection('cores');
            mdb_cores.countDocuments().then(count => {
                var new_code = util.rand_id(5);
                var core = {
                    name: new_code,
                    code: new_code,
                    user_id: client.o_id,
                    status_time: -1,
                    status: "new",
                    ipi: null,
                    nodes: {}
                };
                mdb_cores.insertOne(core, (err, status) => {
                    if (err) util.log("mdb", util.ERR, `client ${client.id} error - new core`, err);
                    else {
                        if (status.insertedCount < 1) {
                            util.log("mdb", util.ERR, `client ${client.id} error - new core (not created)`);
                        } else {
                            util.log("ws", util.INF, `client ${client.id} added new core - ${core.name}`);
                            wss.trigger_for_user("get_core_list", null, client.o_id);
                        }
                    }
                });
            });
        });
        wss.bind('get_core_list', (client, req, db) => {
            db.collection('cores').find({ user_id: client.o_id }).toArray((err, items) => {
                if (err) util.log("mdb", util.ERR, `client ${client.id} error - get cores`, err);
                else {
                    var cores = [];
                    var statuses = [];
                    for (var item in items) {
                        cores.push({
                            name: items[item].name,
                            id: items[item]._id.toString()
                        });
                        statuses.push({
                            status: items[item].status,
                            status_time: items[item].status_time,
                            id: items[item]._id.toString()
                        });
                    }
                    wss.send_to_client("core_list", cores, client);
                    util.log("ws", util.INF, `client ${client.id} requested core list`);
                    if (req && req.status) {
                        for (var s in statuses) {
                            wss.send_to_client("core_status", statuses[s], client);
                        }
                    }
                }
            });
        });
        wss.bind('get_core_info', (client, req, db) => {
            var id = req.id.toString();
            db.collection('cores').findOne({ _id: database.o_id(id), user_id: client.o_id }, (err, item) => {
                if (!req.hasOwnProperty('get_nodes')) req.get_nodes = true;
                if (err) util.log("mdb", util.ERR, `client ${client.id} error - get core ${id}`, err);
                else {
                    if (item == null) {
                        util.log("mdb", util.ERR, `client ${client.id} error - get core ${id} (not found)`);
                    } else {
                        wss.send_to_client("core_info", {
                            name: item.name,
                            code: item.code,
                            id: item._id.toString()
                        }, client);
                        wss.send_to_client("core_status", {
                            id: item._id.toString(),
                            status: item.status,
                            status_time: item.status_time
                        }, client);
                        util.log("ws", util.INF, `client ${client.id} requested core ${item._id.toString()} info`);
                        if (item.status != "new" && req.get_nodes) {
                            wss.send_to_client("core_nodes", {
                                id: item._id.toString(),
                                nodes: item.nodes
                            }, client);
                        }
                    }
                }
            });
        });
        wss.bind('set_core_name', (client, req, db) => {
            var id = `${req.id}`;
            db.collection('cores').findOne({ _id: database.o_id(id), user_id: client.o_id }, (err, item) => {
                if (err) util.log("mdb", util.ERR, `client ${client.id} error - set core ${id} name`, err);
                else {
                    if (item == null) {
                        util.log("mdb", util.ERR, `client ${client.id} error - set core ${id} name (not found)`);
                    } else {
                        db.collection('cores').updateOne({ _id: item._id }, { $set: { 'name': req.name } }, (err2, result) => {
                            if (err2) util.log("mdb", util.ERR, `client ${client.id} error - set core ${id} name (update core)`, err2);
                            else {
                                util.log("ws", util.INF, `client ${client.id} set core ${id} name`);
                                wss.send_to_user("core_name", {
                                    name: req.name,
                                    id: item._id.toString()
                                }, client.o_id);
                            }
                        });
                    }
                }
            });
        });
        wss.bind('delete_core', (client, req, db) => {
            var id = `${req}`;
            db.collection('cores').findOne({ _id: database.o_id(id), user_id: client.o_id }, (err, item) => {
                if (err) util.log("mdb", util.ERR, `client ${client.id} error - delete core ${id} (find core)`, err);
                else {
                    if (item == null) {
                        util.log("mdb", util.ERR, `client ${client.id} error - delete core ${id} (find core - not found)`);
                    } else {
                        var in_ids = [];
                        for (var i in item.nodes) {
                            in_ids.push(database.o_id(item.nodes[i]));
                        }
                        db.collection('nodes').deleteMany({ _id: { $in: in_ids } }, (err2, result) => {
                            if (err2) util.log("mdb", util.ERR, `client ${client.id} error - delete core ${id} (delete nodes)`, err2);
                            else {
                                db.collection('cores').deleteOne({ _id: item._id, user_id: client.o_id }, (err3, result2) => {
                                    if (err3) util.log("mdb", util.ERR, `client ${client.id} error - delete core ${id} (delete core)`, err3);
                                    else {
                                        util.log("ws", util.INF, `client ${client.id} deleted core ${id}`);
                                        wss.send_to_user('delete_core', item._id.toString(), item.user_id);
                                        wss.trigger_for_user('get_core_list', null, item.user_id);
                                    }
                                });
                            }
                        });
                    }
                }
            });
        });
        wss.bind('get_node_info', (client, req, db) => {
            var id = req.toString();
            db.collection('nodes').findOne({ _id: database.o_id(id), user_id: client.o_id }, (err, item) => {
                if (err) util.log("mdb", util.ERR, `client ${client.id} error - get node ${id}`, err);
                else {
                    if (item == null) {
                        util.log("mdb", util.ERR, `client ${client.id} error - get node ${id} (not found)`);
                    } else {
                        wss.send_to_client("node_info", {
                            name: item.name,
                            mac: item.mac,
                            core_id: item.core_id,
                            type: item.type,
                            id: item._id.toString()
                        }, client);
                        wss.send_to_client("node_status", {
                            id: item._id.toString(),
                            status: item.status,
                            status_time: item.status_time,
                            core_id: item.core_id
                        }, client);
                        util.log("ws", util.INF, `client ${client.id} requested node ${id} info`);
                    }
                }
            });
        });
        wss.bind('set_node_name', (client, req, db) => {
            var id = `${req.id}`;
            db.collection('nodes').findOne({ _id: database.o_id(id), user_id: client.o_id }, (err, item) => {
                if (err) util.log("mdb", util.ERR, `client ${client.id} error - set node ${id} name`, err);
                else {
                    if (item == null) {
                        util.log("mdb", util.ERR, `client ${client.id} error - set node ${id} name (not found)`);
                    } else {
                        db.collection('nodes').updateOne({ _id: item._id }, { $set: { 'name': req.name } }, (err2, result) => {
                            if (err2) util.log("mdb", util.ERR, `client ${client.id} error - set node ${id} name (update node)`, err2);
                            else {
                                util.log("ws", util.INF, `client ${client.id} set node ${id} name info`);
                                wss.send_to_user("node_name", {
                                    name: req.name,
                                    core_id: item.core_id,
                                    id: item._id.toString()
                                }, client.o_id);
                            }
                        });
                    }
                }
            });
        });
        wss.bind('delete_node', (client, req, db) => {
            var id = `${req}`;
            db.collection('nodes').findOne({ _id: database.o_id(id), user_id: client.o_id }, (err, item) => {
                if (err) util.log("mdb", util.ERR, `client ${client.id} error - delete node ${id} (find node)`, err);
                else {
                    if (item == null) {
                        util.log("mdb", util.ERR, `client ${client.id} error - delete node ${id} (find node - not found)`);
                    } else {
                        var unset = {};
                        unset[`nodes.${item.mac}`] = "";
                        db.collection('cores').updateOne({ _id: database.o_id(item.core_id), user_id: client.o_id }, { $unset: unset }, (err2, result) => {
                            if (err2) util.log("mdb", util.ERR, `client ${client.id} error - delete node ${id} (update core/delete node reference)`, err2);
                            else {
                                db.collection('nodes').deleteOne({ _id: item._id, user_id: client.o_id }, (err3, result2) => {
                                    if (err3) util.log("mdb", util.ERR, `client ${client.id} error - delete node ${id} (delete node)`, err3);
                                    else {
                                        util.log("ws", util.INF, `client ${client.id} deleted node ${id}`);
                                        wss.send_to_user('delete_node', item._id.toString(), item.user_id);
                                        wss.trigger_for_user('get_core_info', { id: item.core_id }, item.user_id);
                                    }
                                });
                            }
                        });
                    }
                }
            });
        });
        wss.bind('get_node_data', (client, req, db) => {
            var id = req.id.toString();
            db.collection('nodes').findOne({ _id: database.o_id(id), user_id: client.o_id }, (err, item) => {
                if (err) util.log("mdb", util.ERR, `client ${client.id} error - get node ${id}`, err);
                else {
                    if (item == null) {
                        util.log("mdb", util.ERR, `client ${client.id} error - get node ${id} (not found)`);
                    } else {
                        if (req.hasOwnProperty('field') && req.field) {
                            var field_val = item.data[req.field];
                            item.data = {};
                            item.data[req.field] = field_val;
                        }
                        wss.send_to_client("node_data", {
                            id: item._id.toString(),
                            core_id: item.core_id,
                            data: item.data
                        }, client);
                        util.log("ws", util.INF, `client ${client.id} requested node ${id} data`);
                    }
                }
            });
        });
        wss.bind('update_node_data', (client, req, db) => {
            var id = `${req.id}`;
            db.collection('nodes').findOne({ _id: database.o_id(id) }, (err, item) => {
                if (err) util.log("mdb", util.ERR, `client ${client.id} error - update node ${id} data`, err);
                else {
                    if (item == null) {
                        util.log("mdb", util.ERR, `client ${client.id} error - update node ${id} data (not found)`);
                    } else {
                        var _send = _ => {
                            for (var c_id in wss.clients) {
                                if (
                                    wss.clients.hasOwnProperty(c_id) &&
                                    wss.clients[c_id] !== null &&
                                    wss.clients[c_id].auth &&
                                    wss.clients[c_id].type == "core" &&
                                    wss.clients[c_id].o_id == item.core_id
                                ) {
                                    wss.clients[c_id].socket.send(`@node-data-${item._id.toString()}-${req.field_id}-${req.field_val}`);
                                }
                            }
                        };
                        var _save = _ => {
                            var set = {};
                            set[`data.${req.field_id}`] = app.correct_type(req.field_val, item.type);
                            db.collection('nodes').updateOne({ _id: item._id }, { $set: set }, (err2, result) => {
                                if (err2) util.log("mdb", util.ERR, `client ${client.id} error - update node ${id} data (update node)`, err2);
                                else {
                                    util.log("ws", util.INF, `client ${client.id} update node ${id} data`);
                                    wss.trigger_for_user_except("get_node_data", { id: id, field: req.field_id }, item.user_id, client.id);
                                    db.collection('cores').findOne({ _id: database.o_id(item.core_id), user_id: item.user_id }, (err, item2) => {
                                        if (item2 == null) {
                                            util.log("mdb", util.ERR, `client ${client.id} error - update node ${id} data (send to device - core not found)`);
                                        } else {
                                            if (item2.status == "online") _send();
                                        }
                                    });
                                }
                            });
                        }
                        var _next = _ => {
                            if (req.hasOwnProperty('transitional') && req.transitional === true)
                                _send();
                            else _save();
                        };
                        if (app.node_drivers[item.type].drivers.hasOwnProperty(id) && app.node_drivers[item.type].drivers[id] &&
                            app.node_drivers[item.type].drivers[id].hasOwnProperty(req.field_id) && app.node_drivers[item.type].drivers[id][req.field_id]) {
                            app.node_drivers[item.type].drivers[id][req.field_id](item, client, req.field_val, req.hasOwnProperty('transitional') && req.transitional === true, value => {
                                if (value != undefined)
                                    req.field_val = value;
                                _next();
                            });
                        } else _next();
                    }
                }
            });
        });

        // client: device
        wss.bind('core_sync', (client, req, db) => {
            db.collection('cores').findOne({ _id: mongodb.ObjectId(req.id), code: req.code }, (err, item) => {
                if (err) util.log("mdb", util.ERR, `${client.id} error - core sync (find core)`, err);
                else {
                    if (item == null)
                        wss.send_to_device('sync', 'f', client);
                    else {
                        db.collection('users').findOne({ _id: mongodb.ObjectId(item.user_id), username: req.user }, (err2, item2) => {
                            if (err2) util.log("mdb", util.ERR, `${client.id} error - core sync (user verification)`, err2);
                            else {
                                if (item2 == null)
                                    wss.send_to_device('sync', 'f', client);
                                else {
                                    db.collection('cores').updateOne({ _id: mongodb.ObjectId(req.id), code: req.code }, {
                                        $set: {
                                            name: item.name == item.code ? "C-" + (req.mac.slice(req.mac.length - 5)) : item.name,
                                            status: "online",
                                            status_time: (new Date()).getTime(),
                                            ipi: req.ip,
                                            mac: req.mac
                                        }
                                    }, (err3, result) => {
                                        if (err3) util.log("mdb", util.ERR, `${client.id} error - core sync (update core)`, err3);
                                        else {
                                            if (result.matchedCount < 1)
                                                util.log("mdb", util.ERR, `${client.id} error - core sync (update core - not found)`);
                                            else {
                                                client.o_id = item._id.toString();
                                                client.auth = true;
                                                client.type = "core";
                                                wss.send_to_device('sync', 't', client);
                                                util.log("ws", util.INF, `client ${client.id} synced as core ${client.o_id}`);
                                                wss.trigger_for_user("get_core_info", { id: client.o_id }, item.user_id);
                                                var count = 0;
                                                for (var n in item.nodes) {
                                                    if (item.nodes.hasOwnProperty(n) && item.nodes[n]) {
                                                        for (var cl in wss.clients) {
                                                            if (
                                                                wss.clients.hasOwnProperty(cl) && wss.clients[cl] &&
                                                                wss.clients[cl].type == "node" && wss.clients[cl].o_id == item.nodes[n] &&
                                                                wss.clients[cl].auth
                                                            ) {
                                                                wss.send_to_device("info", `${req.ip}-${item.nodes[n]}`, wss.clients[cl]);
                                                                count++;
                                                            }
                                                        }
                                                    }
                                                }
                                                util.log("ws", util.INF, `forwarded info to ${count} nodes of core ${client.o_id} `);
                                            }
                                        }
                                    });
                                }
                            }
                        });
                    }
                }
            });
        }, false);
        wss.bind('core_hb', (client, req, db) => {
            db.collection('cores').findOne({ _id: database.o_id(client.o_id) }, (err, item) => {
                if (err) util.log("mdb", util.ERR, `client ${client.id} error - core ${client.o_id} heartbeat (find core)`, err);
                else {
                    if (item == null) {
                        util.log("mdb", util.ERR, `client ${client.id} error - core ${client.o_id} heartbeat (core not found)`);
                    } else {
                        util.log("ws", util.REP, `client ${client.id} core ${client.o_id} heartbeat`);
                        var now = (new Date()).getTime();
                        db.collection('cores').updateOne({ _id: database.o_id(client.o_id) }, { $set: { status: "online", status_time: now } }, (err2, result) => {
                            if (err2) util.log("mdb", util.ERR, `client ${client.id} error - core ${client.o_id} heartbeat (update core)`, err2);
                            else {
                                if (result.matchedCount < 1) {
                                    util.log("mdb", util.ERR, `client ${client.id} error - core ${client.o_id} heartbeat (core not found)`);
                                } else {
                                    if (item.status != "online") {
                                        wss.send_to_user("core_status", {
                                            id: item._id.toString(),
                                            status: "online",
                                            status_time: now
                                        }, item.user_id);
                                    }
                                }
                            }
                        });
                    }
                }
            });
        });
        wss.bind('node_sync', (client, req, db) => {
            var mdb_cores = db.collection('cores');
            mdb_cores.findOne({ code: req.core_code }, (err, item) => {
                if (err) util.log("mdb", util.ERR, `${client.id} error - node sync (find core)`, err);
                else {
                    if (item == null) {
                        wss.send_to_device('sync', 'f', client);
                    } else {
                        db.collection('users').findOne({ _id: mongodb.ObjectId(item.user_id), username: req.user }, (err2, item2) => {
                            if (err2) util.log("mdb", util.ERR, `${client.id} error - node sync (user verification)`, err2);
                            else {
                                if (item2 == null) {
                                    wss.send_to_device('sync', 'f', client);
                                } else {
                                    var node_type = app.node_drivers.hasOwnProperty(req.node_type) && app.node_drivers[req.node_type] ? req.node_type : 'node';
                                    if (item.nodes.hasOwnProperty(req.mac) && item.nodes[req.mac]) {
                                        var node_id = item.nodes[req.mac];
                                        wss.send_to_device('sync', `t`, client);
                                        client.o_id = node_id;
                                        client.type = "node";
                                        client.auth = true;
                                        util.log("ws", util.INF, `client ${client.id} synced as node ${client.o_id}`);
                                        app.node_drivers[node_type].drivers[node_id] = app.node_drivers[node_type].init();
                                        if (item.status == "online") {
                                            util.delay(_ => {
                                                wss.send_to_device("info", `${item.ipi}-${client.o_id}`, client);
                                                util.log("ws", util.INF, `info forwarded to node ${client.o_id}`);
                                            }, 300);
                                        }
                                    } else {
                                        var node_data = {};
                                        for (var v in app.node_drivers[node_type].data.data) {
                                            var value_profile = app.node_drivers[node_type].data.data[v];
                                            node_data[value_profile.id] = value_profile.initial;
                                        }
                                        var node = {
                                            name: "N-" + (req.mac.slice(req.mac.length - 5)),
                                            core_id: item._id.toString(),
                                            core_code: item.code,
                                            mac: req.mac,
                                            user_id: item.user_id,
                                            status_time: -1,
                                            status: "new",
                                            type: node_type,
                                            data: node_data
                                        };
                                        db.collection('nodes').insertOne(node, (err3, status) => {
                                            if (err3) util.log("mdb", util.ERR, `client ${client.id} error - node sync (create node)`, err3);
                                            else {
                                                if (status.insertedCount < 1)
                                                    util.log("mdb", util.ERR, `client ${client.id} error - node sync (create node - not created)`);
                                                else {
                                                    var node_id = status.insertedId.toString();
                                                    var set = { $set: {} };
                                                    set["$set"]["nodes." + req.mac] = node_id;
                                                    mdb_cores.updateOne({ _id: item._id, code: item.code }, set, (err4, status2) => {
                                                        if (err4) util.log("mdb", util.ERR, `client ${client.id} error - node sync (update core)`, err4);
                                                        else {
                                                            if (status2.matchedCount < 1) {
                                                                util.log("mdb", util.ERR, `client ${client.id} error - node sync (update core - not found)`);
                                                            } else {
                                                                wss.send_to_device('sync', `t`, client);
                                                                util.log("ws", util.INF, `client ${client.id} added new node - ${node.name}`);
                                                                client.o_id = node_id;
                                                                client.type = "node";
                                                                client.auth = true;
                                                                util.log("ws", util.INF, `client ${client.id} synced as node ${client.o_id}`);
                                                                app.node_drivers[node_type].drivers[node_id] = app.node_drivers[node_type].init();
                                                                wss.trigger_for_user('get_core_info', {
                                                                    id: node.core_id,
                                                                    get_nodes: true
                                                                }, node.user_id);
                                                                if (item.status == "online") {
                                                                    util.delay(_ => {
                                                                        wss.send_to_device("info", `${item.ipi}-${client.o_id}`, client);
                                                                        util.log("ws", util.INF, `info forwarded to node ${client.o_id}`);
                                                                    }, 300);
                                                                }
                                                            }
                                                        }
                                                    });
                                                }
                                            }
                                        });
                                    }
                                }
                            }
                        });
                    }
                }
            });
        }, false);
        wss.bind('node_hb', (client, req, db) => {
            var mdb_nodes = db.collection('nodes');
            db.collection('cores').findOne({ _id: database.o_id(client.o_id) }, (err, item) => {
                if (err) util.log("mdb", util.ERR, `client ${client.id} error - node[${req.id}] heartbeat (find core)`, err);
                else {
                    if (item == null) {
                        util.log("mdb", util.ERR, `client ${client.id} error - node[${req.id}] heartbeat (core not found)`);
                    } else {
                        var node_mdb_id = req.id;
                        if (node_mdb_id) {
                            mdb_nodes.findOne({ _id: database.o_id(node_mdb_id) }, (err2, item2) => {
                                if (err2) util.log("mdb", util.ERR, `client ${client.id} error - node[${req.id}] heartbeat (find node)`, err2);
                                else {
                                    if (item2 == null) {
                                        util.log("mdb", util.ERR, `client ${client.id} error - node[${req.id}] heartbeat (find node - not found)`, err2);
                                        wss.send_to_device("node-hb", `${node_mdb_id}-404`, client);
                                    } else {
                                        util.log("ws", util.REP, `client ${client.id} node[${req.id}] heartbeat`);
                                        var now = (new Date()).getTime();
                                        mdb_nodes.updateOne({ _id: database.o_id(node_mdb_id) }, { $set: { status: "online", status_time: now } }, (err3, result) => {
                                            if (err3) util.log("mdb", util.ERR, `client ${client.id} error - node[${req.id}] heartbeat (update node)`, err3);
                                            else {
                                                if (result.matchedCount < 1) {
                                                    util.log("mdb", util.ERR, `client ${client.id} error - node[${req.id}] heartbeat (update node - not found)`);
                                                } else {
                                                    if (item2.status != "online") {
                                                        wss.send_to_user("node_status", {
                                                            id: item2._id.toString(),
                                                            core_id: item2.core_id,
                                                            status: "online",
                                                            status_time: now
                                                        }, item2.user_id);
                                                        if (app.node_drivers[item2.type].drivers.hasOwnProperty(node_mdb_id)) {
                                                            for (var d in app.node_drivers[item2.type].drivers[node_mdb_id]) {
                                                                var initial_val;
                                                                for (var f in app.node_drivers[item2.type].data.data) {
                                                                    if (app.node_drivers[item2.type].data.data[f].id == d) {
                                                                        initial_val = app.node_drivers[item2.type].data.data[f].initial;
                                                                        break;
                                                                    }
                                                                }
                                                                wss.trigger_for_user('update_node_data', {
                                                                    id: item2._id.toString(),
                                                                    transitional: true,
                                                                    field_id: d,
                                                                    field_val: item2.data[d] == undefined ? initial_val : item2.data[d]
                                                                }, item2.user_id);
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        });
                                    }
                                }
                            });
                        } else util.log("mdb", util.ERR, `client ${client.id} error - node[${req.id}] heartbeat (node id not found)`);
                    }
                }
            });
        });
    }
};