/* {{APPLICATION_NAME}} */
// utilities

var util = {
    mobile: _ => {
        return jQuery.browser.mobile;
    },
    cookie: (id, val, date) => {
        if (Block.is.unset(val))
            document.cookie.split('; ').forEach(cookie => {
                if (cookie.substring(0, id.length) == id)
                    val = cookie.substring(id.length + 1);
            });
        else {
            if (date == '__indefinite__')
                date = 'Fri, 31 Dec 9999 23:59:59 GMT';
            document.cookie =
                id +
                '=' +
                val +
                (Block.is.set(date) ? '; expires=' + date : '');
        }
        return Block.is.unset(val) ? null : val;
    },
    delete_cookie: id => {
        app.util.cookie(id, '', 'Thu, 01 Jan 1970 00:00:00 GMT');
    },
    sha256_secure: (str, callback) => {
        const msgUint8 = new TextEncoder("utf-8").encode(str);
        const hashBuffer_promise = crypto.subtle.digest('SHA-256', msgUint8);
        hashBuffer_promise.then(hashBuffer => {
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
            if (callback) callback(hashHex);
        });
    }, // https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest
    lpad: (s, width, char) => {
        return s.length >= width
            ? s
            : (new Array(width).join(char) + s).slice(-width);
    }, // https://stackoverflow.com/questions/10841773/javascript-format-number-to-day-with-always-3-digits
    capitalize: word => {
        return word.charAt(0).toUpperCase() + word.slice(1);
    },
    duration_desc: last_timestamp => {
        if (last_timestamp < 0) return "";
        var deltaSec = parseInt(Date.now() / 1000) - parseInt(last_timestamp / 1000);
        if (deltaSec < 0) {
            deltaSec = 0;
        }
        var outputString = "";
        if (deltaSec < 5) {
            outputString += "now";
        } else if (deltaSec < 60) {
            outputString += "" + parseInt(Math.floor(parseFloat(deltaSec) / 5.0) * 5.0) + " seconds ago";
        } else if (deltaSec < 3600) {
            var mins = parseInt(deltaSec / 60);
            if (mins == 1) {
                outputString += "" + mins + " minute ago";
            } else {
                outputString += "" + mins + " minutes ago";
            }
        } else {
            var hrs = parseInt(deltaSec / 3600);
            if (hrs == 1) {
                outputString += "" + hrs + " hour ago";
            } else {
                outputString += "" + hrs + " hours ago";
            }
        }
        return outputString;
    }
};