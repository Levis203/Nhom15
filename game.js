'use strict';


function Game(id, params) {
    var _ = this;
    var settings = {
        width: 960,						// Chiều rộng của canvas
        height: 640						// Chiều cao của canvas
    };
    Object.assign(_, settings, params);
    var $canvas = document.getElementById(id);
    $canvas.width = _.width;
    $canvas.height = _.height;
    var _context = $canvas.getContext('2d');	// Ngữ cảnh vẽ của canvas
    var _stages = [];							// Hàng đợi các đối tượng Stage
    var _events = {};							// Bộ sưu tập sự kiện
    var _index = 0,								// Chỉ mục của Stage hiện tại
        _hander;  								// Điều khiển frame animation

    // Hàm tạo đối tượng hoạt động
    var Item = function (params) {
        this._params = params || {};
        this._id = 0;               // ID
        this._stage = null;         // Liên kết với Stage tương ứng
        this._settings = {
            x: 0,					// Tọa độ: Hoành độ
            y: 0,					// Tọa độ: Tung độ
            width: 20,				// Chiều rộng
            height: 20,				// Chiều cao
            type: 0,					// Loại đối tượng, 0: đối tượng bình thường, 1: người chơi kiểm soát, 2: đối tượng kiểm soát bởi chương trình
            color: '#F00',			// Màu sắc đối tượng
            status: 1,				// Trạng thái đối tượng, 0: chưa kích hoạt/kết thúc, 1: bình thường, 2: tạm dừng, 3: tạm thời, 4: bất thường
            orientation: 0,			// Hướng hiện tại, 0: phải, 1: dưới, 2: trái, 3: trên
            speed: 0,				// Tốc độ di chuyển
            // Liên quan đến bản đồ
            location: null,			// Định vị trên bản đồ, đối tượng Map
            coord: null,				// Nếu đối tượng liên kết với bản đồ, cần đặt tọa độ trên bản đồ; nếu không liên kết, đặt tọa độ vị trí
            path: [],				// Đường đi tự động của NPC
            vector: null,			// Tọa độ mục tiêu
            // Liên quan đến bố cục
            frames: 1,				// Cấp độ tốc độ, bộ đếm nội bộ để xác định bao nhiêu frame thay đổi một lần
            times: 0,				// Bộ đếm để làm mới canvas (sử dụng để xác định trạng thái vòng lặp animation)
            timeout: 0,				// Đếm ngược (sử dụng để xác định trạng thái animation quá trình)
            control: {},				// Bộ đệm điều khiển, xử lý khi đến điểm định vị
            update: function () { }, 	// Cập nhật thông tin tham số
            draw: function () { }		// Vẽ
        };
        Object.assign(this, this._settings, this._params);
    };

    Item.prototype.bind = function (eventType, callback) {
        if (!_events[eventType]) {
            _events[eventType] = {};
            $canvas.addEventListener(eventType, function (e) {
                var position = _.getPosition(e);
                _stages[_index].items.forEach(function (item) {
                    if (item.x <= position.x && position.x <= item.x + item.width && item.y <= position.y && position.y <= item.y + item.height) {
                        var key = 's' + _index + 'i' + item._id;
                        if (_events[eventType][key]) {
                            _events[eventType][key](e);
                        }
                    }
                });
                e.preventDefault();
            });
        }
        _events[eventType]['s' + this._stage.index + 'i' + this._id] = callback.bind(this);  // Liên kết phạm vi
    };



    // Hàm tạo đối tượng Map
    var Map = function (params) {
        this._params = params || {};
        this._id = 0;               // ID
        this._stage = null;         // Liên kết với Stage tương ứng
        this._settings = {
            x: 0,					// Tọa độ điểm bắt đầu của bản đồ
            y: 0,
            size: 20,				// Chiều rộng của một ô trên bản đồ
            data: [],				// Dữ liệu của bản đồ
            x_length: 0,				// Độ dài trục x của mảng hai chiều
            y_length: 0,				// Độ dài trục y của mảng hai chiều
            frames: 1,				// Cấp độ tốc độ, bộ đếm nội bộ để xác định bao nhiêu frame thay đổi một lần
            times: 0,				// Bộ đếm để làm mới canvas (sử dụng để xác định trạng thái vòng lặp animation)
            cache: false,    		// Có phải là tĩnh hay không (nếu là tĩnh, đặt giá trị cache)
            update: function () { },	// Cập nhật dữ liệu bản đồ
            draw: function () { },		// Vẽ bản đồ
        };
        Object.assign(this, this._settings, this._params);
    };

    // Hàm lấy giá trị tại một điểm trên bản đồ
    Map.prototype.get = function (x, y) {
        if (this.data[y] && typeof this.data[y][x] !== 'undefined') {
            return this.data[y][x];
        }
        return -1;
    };

    // Hàm đặt giá trị tại một điểm trên bản đồ
    Map.prototype.set = function (x, y, value) {
        if (this.data[y]) {
            this.data[y][x] = value;
        }
    };

    // Chuyển đổi tọa độ trên bản đồ thành tọa độ trên canvas
    Map.prototype.coord2position = function (cx, cy) {
        return {
            x: this.x + cx * this.size + this.size / 2,
            y: this.y + cy * this.size + this.size / 2
        };
    };

    // Chuyển đổi tọa độ trên canvas thành tọa độ trên bản đồ
    Map.prototype.position2coord = function (x, y) {
        var fx = Math.abs(x - this.x) % this.size - this.size / 2;
        var fy = Math.abs(y - this.y) % this.size - this.size / 2;
        return {
            x: Math.floor((x - this.x) / this.size),
            y: Math.floor((y - this.y) / this.size),
            offset: Math.sqrt(fx * fx + fy * fy)
        };
    };



    // Thuật toán tìm đường
    Map.prototype.finder = function (params) {
        var defaults = {
            map: null,
            start: {},
            end: {},
            type: 'path'
        };

        var options = Object.assign({}, defaults, params);
        if (options.map[options.start.y][options.start.x] || options.map[options.end.y][options.end.x]) { // Khi điểm bắt đầu hoặc điểm kết thúc được đặt trên tường
            return [];
        }

        var finded = false;
        var result = [];
        var y_length = options.map.length;
        var x_length = options.map[0].length;
        var steps = Array(y_length).fill(0).map(() => Array(x_length).fill(0));     // Bản đồ cho các bước đi
        var _getValue = function (x, y) {  // Lấy giá trị trên bản đồ
            if (options.map[y] && typeof options.map[y][x] !== 'undefined') {
                return options.map[y][x];
            }
            return -1;
        };

        var _next = function (to) { // Xác định xem có thể đi được hay không, nếu có thì thêm vào danh sách
            var value = _getValue(to.x, to.y);
            if (value < 1) {
                if (value === -1) {
                    to.x = (to.x + x_length) % x_length;
                    to.y = (to.y + y_length) % y_length;
                    to.change = 1;
                }
                if (!steps[to.y][to.x]) {
                    result.push(to);
                }
            }
        };

        var _render = function (list) {// Tìm đường đi
            var new_list = [];

            var next = function (from, to) {
                var value = _getValue(to.x, to.y);
                if (value < 1) {	// Kiểm tra xem điểm hiện tại có thể đi được không
                    if (value === -1) {
                        to.x = (to.x + x_length) % x_length;
                        to.y = (to.y + y_length) % y_length;
                        to.change = 1;
                    }
                    if (to.x === options.end.x && to.y === options.end.y) {
                        steps[to.y][to.x] = from;
                        finded = true;
                    } else if (!steps[to.y][to.x]) {
                        steps[to.y][to.x] = from;
                        new_list.push(to);
                    }
                }
            };
            list.forEach(function (current) {
                next(current, { y: current.y + 1, x: current.x });
                next(current, { y: current.y, x: current.x + 1 });
                next(current, { y: current.y - 1, x: current.x });
                next(current, { y: current.y, x: current.x - 1 });
            });
            if (!finded && new_list.length) {
                _render(new_list);
            }
        };

        _render([options.start]);
        if (finded) {
            var current = options.end;
            if (options.type === 'path') {
                while (current.x !== options.start.x || current.y !== options.start.y) {
                    result.unshift(current);
                    current = steps[current.y][current.x];
                }
            } else if (options.type === 'next') {
                _next({ x: current.x + 1, y: current.y });
                _next({ x: current.x, y: current.y + 1 });
                _next({ x: current.x - 1, y: current.y });
                _next({ x: current.x, y: current.y - 1 });
            }
        }

        return result;
    };



    // Đối tượng Bố cục
    var Stage = function (params) {
        this._params = params || {};
        this._settings = {
            index: 0,                        // Chỉ mục Bố cục
            status: 0,						// Trạng thái Bố cục, 0 đại diện cho chưa kích hoạt/kết thúc, 1 đại diện cho bình thường, 2 đại diện cho tạm dừng, 3 đại diện cho trạng thái tạm thời
            maps: [],						// Danh sách Bản đồ
            audio: [],						// Tài nguyên Âm thanh
            images: [],						// Tài nguyên Hình ảnh
            items: [],						// Danh sách Đối tượng
            timeout: 0,						// Đồng hồ đếm ngược (được sử dụng để xác định trạng thái hoạt động của hoạt ảnh)
            update: function () { }				// Dò tìm, xử lý mối quan hệ tương đối giữa các đối tượng khác nhau trong bố cục
        };
        Object.assign(this, this._settings, this._params);
    };



    // Thêm Đối tượng
    Stage.prototype.createItem = function (options) {
        var item = new Item(options);
        // Thuộc tính động
        if (item.location) {
            Object.assign(item, item.location.coord2position(item.coord.x, item.coord.y));
        }
        // Gán mối quan hệ
        item._stage = this;
        item._id = this.items.length;
        this.items.push(item);
        return item;
    };



    // Đặt lại vị trí của các đối tượng
    Stage.prototype.resetItems = function () {
        this.status = 1;
        this.items.forEach(function (item, index) {
            Object.assign(item, item._settings, item._params);
            if (item.location) {
                Object.assign(item, item.location.coord2position(item.coord.x, item.coord.y));
            }
        });
    };



    // Lấy danh sách các đối tượng theo loại
    Stage.prototype.getItemsByType = function (type) {
        return this.items.filter(function (item) {
            return item.type == type;
        });
    };


    // Thêm Bản đồ
    Stage.prototype.createMap = function (options) {
        var map = new Map(options);
        // Thuộc tính động
        map.data = JSON.parse(JSON.stringify(map._params.data));
        map.y_length = map.data.length;
        map.x_length = map.data[0].length;
        map.imageData = null;
        // Gán mối quan hệ
        map._stage = this;
        map._id = this.maps.length;
        this.maps.push(map);
        return map;
    };



    // Đặt lại Bản đồ
    Stage.prototype.resetMaps = function () {
        this.status = 1;
        this.maps.forEach(function (map) {
            Object.assign(map, map._settings, map._params);
            map.data = JSON.parse(JSON.stringify(map._params.data));
            map.y_length = map.data.length;
            map.x_length = map.data[0].length;
            map.imageData = null;
        });
    };


    // Đặt lại
    Stage.prototype.reset = function () {
        Object.assign(this, this._settings, this._params);
        this.resetItems();
        this.resetMaps();
    };


    // Gán sự kiện
    Stage.prototype.bind = function (eventType, callback) {
        if (!_events[eventType]) {
            _events[eventType] = {};
            window.addEventListener(eventType, function (e) {
                var key = 's' + _index;
                if (_events[eventType][key]) {
                    _events[eventType][key](e);
                }
                e.preventDefault();
            });
        }
        _events[eventType]['s' + this.index] = callback.bind(this);	// Gán phạm vi sự kiện
    };




    // Bắt đầu hoạt ảnh
    this.start = function () {
        var f = 0;		// Số khung tính toán
        var timestamp = (new Date()).getTime();
        var fn = function () {
            var now = (new Date()).getTime();
            if (now - timestamp < 16) {   // Giới hạn tần suất, ngăn chặn hoạt ảnh trên màn hình chạy quá nhanh
                _hander = requestAnimationFrame(fn);
                return false;
            }
            timestamp = now;
            var stage = _stages[_index];
            _context.clearRect(0, 0, _.width, _.height);		// Xóa bảng vẽ
            _context.fillStyle = '#000000';
            _context.fillRect(0, 0, _.width, _.height);
            f++;
            if (stage.timeout) {
                stage.timeout--;
            }
            if (stage.update() != false) {		            // Nếu update trả về false, thì không vẽ
                stage.maps.forEach(function (map) {
                    if (!(f % map.frames)) {
                        map.times = f / map.frames;		// Bộ đếm
                    }
                    if (map.cache) {
                        if (!map.imageData) {
                            _context.save();
                            map.draw(_context);
                            map.imageData = _context.getImageData(0, 0, _.width, _.height);
                            _context.restore();
                        } else {
                            _context.putImageData(map.imageData, 0, 0);
                        }
                    } else {
                        map.update();
                        map.draw(_context);
                    }
                });
                stage.items.forEach(function (item) {
                    if (!(f % item.frames)) {
                        item.times = f / item.frames;		   // Bộ đếm
                    }
                    if (stage.status == 1 && item.status != 2) {  	// Nếu đối tượng và trạng thái Bố cục đều không ở trạng thái tạm dừng
                        if (item.location) {
                            item.coord = item.location.position2coord(item.x, item.y);
                        }
                        if (item.timeout) {
                            item.timeout--;
                        }
                        item.update();
                    }
                    item.draw(_context);
                });
            }
            _hander = requestAnimationFrame(fn);
        };
        _hander = requestAnimationFrame(fn);
    };


    // Kết thúc hoạt ảnh
    this.stop = function () {
        _hander && cancelAnimationFrame(_hander);
    };


    // Tọa độ sự kiện
    this.getPosition = function (e) {
        var box = $canvas.getBoundingClientRect();
        return {
            x: e.clientX - box.left * (_.width / box.width),
            y: e.clientY - box.top * (_.height / box.height)
        };
    }




    // Tạo Bố cục
    this.createStage = function (options) {
        var stage = new Stage(options);
        stage.index = _stages.length;
        _stages.push(stage);
        return stage;
    };



    // Xác định Bố cục
    this.setStage = function (index) {
        _stages[_index].status = 0;
        _index = index;
        _stages[_index].status = 1;
        _stages[_index].reset(); // Đặt lại
        return _stages[_index];
    };



    // Bố cục tiếp theo
    this.nextStage = function () {
        if (_index < _stages.length - 1) {
            return this.setStage(++_index);
        } else {
            throw new Error('Không tìm thấy Bố cục mới.');
        }
    };



    // Lấy danh sách Bố cục
    this.getStages = function () {
        return _stages;
    };


    var audio_start = new Audio('./audio_opening_song.mp3');


    // Khởi tạo động cơ trò chơi
    this.init = function () {
        _index = 0;
        this.start();
        audio_start.play();
    };

}