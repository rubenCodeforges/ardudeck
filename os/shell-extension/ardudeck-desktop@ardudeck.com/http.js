// Small JSON-over-HTTP helper for the loopback ArduDeck services.
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';

export class LocalApi {
    constructor() {
        this._session = new Soup.Session({timeout: 3});
    }

    /** GET and parse JSON; rejects on network errors and non-2xx. */
    get(url) {
        return this._send(Soup.Message.new('GET', url));
    }

    /** POST/DELETE with the X-ArduDeck header the link service requires for writes. */
    write(method, url, body) {
        const msg = Soup.Message.new(method, url);
        msg.get_request_headers().append('X-ArduDeck', '1');
        if (body !== undefined) {
            const bytes = new GLib.Bytes(new TextEncoder().encode(JSON.stringify(body)));
            msg.set_request_body_from_bytes('application/json', bytes);
        }
        return this._send(msg);
    }

    _send(msg) {
        return new Promise((resolve, reject) => {
            this._session.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, null, (session, res) => {
                try {
                    const bytes = session.send_and_read_finish(res);
                    const text = new TextDecoder().decode(bytes.get_data() ?? new Uint8Array());
                    const data = text ? JSON.parse(text) : null;
                    const status = msg.get_status();
                    if (status < 200 || status >= 300) reject(new Error(data?.error ?? `HTTP ${status}`));
                    else resolve(data);
                } catch (e) {
                    reject(e);
                }
            });
        });
    }

    destroy() {
        this._session.abort();
        this._session = null;
    }
}
