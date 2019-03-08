import * as THREE from "three";

import Globe from "./globe.js";
import ColorGradient from "./ColorGradient.js";
import config_data from "./config.json";

let config = config_data.reduce(
    (c, item) => {
        // console.log(item, c)
        return Object.assign(c, {
            [item.name]: item.default
        })
    }, {}
);
console.log(config)

let colorGradient = new ColorGradient();
let globe = new Globe(config);

export default function (scene, camera, renderer) {
    let canvas_element = renderer.domElement;

    // Ambient light
    let ambient_light = new THREE.AmbientLight(
        0xffffff,
        config.ambient_light_intensity
    );
    scene.add(ambient_light);
    let sunlight = new THREE.DirectionalLight(
        0xffffff,
        config.sunlight_intensity
    );
    sunlight.position.set(1, 0, 0);
    scene.add(sunlight);

    // Follows the camera
    let light = new THREE.PointLight(0xffffff, config.camera_light_intensity);
    scene.add(light);

    let material = getGlobeMaterial();

    let ocean_geometry = new THREE.Geometry();
    let geometry = new THREE.Geometry();
    geometry.dynamic = true;

    let globe_object;

    let clock = new THREE.Clock();

    let zoom_start = 4;

    camera.position.z = zoom_start;
    light.position.z = zoom_start;

    loadGlobe();

    // These shall be used to hold information for controlling the camera position
    let controls = {
        x: null,
        y: null,
        theta: 0,
        phi: 0,
        actual_theta: 0,
        actual_phi: 0,
        zoom: zoom_start,
        actual_zoom: zoom_start,
        touch_delta: 0,
        rotation_speed: 0
    };

    // Creates and adds the globe to the scene
    function loadGlobe() {
        //// Ocean
        globe.points.forEach(point => {
            ocean_geometry.vertices.push(pointToVector(point, false));
        });
        globe.triangles.forEach((triangle, index) => {
            ocean_geometry.faces.push(triangleToFace(index, false));
        });

        var ocean_material = new THREE.MeshPhongMaterial({
            color: 0x0000ff,
            transparent: true,
            opacity: 0.8
        });
        ocean_geometry.computeFaceNormals();
        var ocean = new THREE.Mesh(ocean_geometry, ocean_material);
        scene.add(ocean);

        console.time("computing vertex colors");
        globe.points.forEach(point => {
            point.color = colorGradient.getColor(point.elevation);
        });
        console.timeEnd("computing vertex colors");

        console.time("adding vertices");
        globe.points.forEach(point => {
            geometry.vertices.push(pointToVector(point));
        });
        console.timeEnd("adding vertices");

        console.time("adding triangles");
        globe.triangles.forEach((triangle, index) => {
            geometry.faces.push(triangleToFace(index));
        });
        console.timeEnd("adding triangles");

        if (config.render_globe_interior) {
            material.side = THREE.DoubleSide;
        }

        globe_object = new THREE.Mesh(geometry, material);
        scene.add(globe_object);

        console.time("computing face normals");
        geometry.computeFaceNormals();
        console.timeEnd("computing face normals");
        if (config.compute_vertex_normals) {
            console.time("computing vertex normals");
            geometry.computeVertexNormals();
            console.timeEnd("computing vertex normals");
        }

        console.timeEnd("entire globe initialization");
    }

    // Finds an x, y, z position on a globe given a theta, phi, and radius
    function degreesToPosition(theta, phi, radius) {
        return [
            radius *
            Math.sin((theta * Math.PI) / 360) *
            Math.cos((phi * Math.PI) / 360),
            radius * Math.sin((phi * Math.PI) / 360),
            radius *
            Math.cos((theta * Math.PI) / 360) *
            Math.cos((phi * Math.PI) / 360)
        ];
    }

    //// Controls / Events

    // The main function of animate at this point is to control the camera position
    var animate = function () {
        requestAnimationFrame(animate);

        var clock_delta = clock.getDelta();

        var smoothing = Math.min(12 * clock_delta, 1);
        var threshold = 0.05;

        var zoom_smoothing = Math.min(9 * clock_delta, 1);
        var zoom_threshold = 0.0005;

        var camera_changed = false;

        var rotation_acceleration = Math.min(2 * clock_delta, 1);
        var rotation_full_speed = 0.01;

        if (controls.zoom != controls.actual_zoom) {
            controls.actual_zoom +=
                (controls.zoom - controls.actual_zoom) * zoom_smoothing;

            if (
                controls.actual_zoom < controls.zoom + zoom_threshold &&
                controls.actual_zoom > controls.zoom - zoom_threshold
            ) {
                controls.actual_zoom = controls.zoom;
            }

            camera_changed = true;
        }

        if (
            controls.actual_theta != controls.theta ||
            controls.actual_phi != controls.phi
        ) {
            controls.actual_theta +=
                (controls.theta - controls.actual_theta) * smoothing;
            controls.actual_phi += (controls.phi - controls.actual_phi) * smoothing;

            if (
                controls.actual_phi < controls.phi + threshold &&
                controls.actual_phi > controls.phi - threshold
            ) {
                controls.actual_phi = controls.phi;
            }
            if (
                controls.actual_theta < controls.theta + threshold &&
                controls.actual_theta > controls.theta - threshold
            ) {
                controls.actual_theta = controls.theta;
            }
            camera_changed = true;
        }

        if (camera_changed) {
            camera.position.set(
                ...degreesToPosition(
                    controls.actual_theta,
                    controls.actual_phi,
                    controls.actual_zoom
                )
            );

            // light.position.set(...degreesToPosition(
            // 	45 + controls.actual_theta,
            // 	45 + controls.actual_phi,
            // 	2.5
            // ));
            light.position.set(
                camera.position.x,
                camera.position.y,
                camera.position.z
            );
            camera.lookAt(new THREE.Vector3(0, 0, 0));
            camera.updateMatrix();
        }

        if (config.rotation && controls.rotation_speed != 1) {
            controls.rotation_speed = Math.min(
                controls.rotation_speed + rotation_acceleration,
                1
            );
        } else if (!config.rotation && controls.rotation_speed != 0) {
            controls.rotation_speed = Math.max(
                controls.rotation_speed - rotation_acceleration,
                0
            );
        }

        if (controls.rotation_speed > 0) {
            globe_object.rotation.y += controls.rotation_speed * rotation_full_speed;
        }

        renderer.render(scene, camera);
    };

    animate();

    function pressMove(x, y) {
        // drawing is based on the height, so this scales with size of drawing
        var moveScaling = 500.0 / canvas_element.clientHeight;

        // make movescaling less when youre more zoomed in
        moveScaling *= Math.max(controls.zoom, 1) / zoom_start;

        controls.theta += -((x - controls.x) * moveScaling);
        controls.phi += (y - controls.y) * moveScaling;

        controls.phi = Math.min(180, Math.max(-180, controls.phi));
    }

    function pressDown(x, y) {
        controls.x = x;
        controls.y = y;
    }

    function zoomChange(delta) {
        var zoom_scaling = 0.1;

        controls.zoom += delta * zoom_scaling;

        controls.zoom = Math.max(0.1, controls.zoom);
    }

    // Called on touchstart or touchend if there are 2 or more touches
    function touchesUpdate(x1, y1, x2, y2) {
        controls.touch_delta = Math.sqrt(
            Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2)
        );
    }

    // Called on touchmove if there are 2 or more touches
    function touchesMove(x1, y1, x2, y2) {
        var touch_zoom_scaling = 0.03;

        var new_delta = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));

        zoomChange((controls.touch_delta - new_delta) * touch_zoom_scaling);
    }

    canvas_element.addEventListener(
        "mousedown",
        event => {
            event.preventDefault();
            canvas_element.style.cursor = "grabbing";
            if (event.button == 0) {
                pressDown(event.clientX, event.clientY);
            }
        },
        false
    );

    // for if the user lets go out of the canvas
    window.addEventListener("mouseup", event => {
        canvas_element.style.cursor = "grab";
    });

    canvas_element.addEventListener(
        "mousemove",
        event => {
            event.preventDefault();

            if (event.buttons & 1) {
                pressMove(event.clientX, event.clientY);
            }
            pressDown(event.clientX, event.clientY);
        },
        false
    );

    canvas_element.addEventListener("touchstart", event => {
        event.preventDefault();

        if (event.touches) {
            if (event.touches.length > 1) {
                touchesUpdate(
                    event.touches[0].clientX,
                    event.touches[0].clientY,
                    event.touches[1].clientX,
                    event.touches[1].clientY
                );
            } else {
                pressDown(event.touches[0].clientX, event.touches[0].clientY);
            }
        }
    });

    canvas_element.addEventListener("touchend", event => {
        event.preventDefault();

        if (event.touches && event.touches.length > 0) {
            if (event.touches.length > 1 && event.touches[1]) {
                touchesUpdate(
                    event.touches[0].clientX,
                    event.touches[0].clientY,
                    event.touches[1].clientX,
                    event.touches[1].clientY
                );
            } else {
                pressDown(event.touches[0].clientX, event.touches[0].clientY);
            }
        }
    });

    canvas_element.addEventListener("touchmove", event => {
        event.preventDefault();

        if (event.touches) {
            if (event.touches.length > 1) {
                touchesMove(
                    event.touches[0].clientX,
                    event.touches[0].clientY,
                    event.touches[1].clientX,
                    event.touches[1].clientY
                );
                touchesUpdate(
                    event.touches[0].clientX,
                    event.touches[0].clientY,
                    event.touches[1].clientX,
                    event.touches[1].clientY
                );
            } else {
                pressMove(event.touches[0].clientX, event.touches[0].clientY);
                pressDown(event.touches[0].clientX, event.touches[0].clientY);
            }
        }
    });

    canvas_element.addEventListener("wheel", event => {
        event.preventDefault();
        var divisor = {
            0: 100,
            1: 3,
            2: 1
        } [event.deltaMode]; // based on the usual values for these modes
        zoomChange(event.deltaY / divisor);
    });

    //// Globe stuff

    // Converts a point from globe.json into a THREE.Vector3
    // Takes elevation into account, adjusting for what we've configured
    function pointToVector(point, use_elevation = true) {
        var radius = 1; // corresponds to 20903520 feet
        var elevation = config.elevation_scale * (point.elevation / 20903520);

        // To prevent the earth havin a z-fight with the ocean when elevation_scale is low
        var threshold = 0.001;
        if (Math.abs(elevation) < threshold) {
            elevation = elevation > 0 ? threshold : -threshold;
        }

        if (!use_elevation) {
            elevation = 0;
        }
        return new THREE.Vector3(
            (radius + elevation) * point.x,
            (radius + elevation) * point.y,
            (radius + elevation) * point.z
        );
    }

    // Colors a face when given its index
    function colorFace(face, index) {
        var triangle = globe.triangles[index];

        var points = [
            globe.points[triangle.p1],
            globe.points[triangle.p2],
            globe.points[triangle.p3]
        ];
        switch (config.triangle_coloring) {
            case "max":
                var color = points.reduce((p1, p2) =>
                    p1.elevation > p2.elevation ? p1 : p2
                ).color;

                face.vertexColors[0] = color;
                face.vertexColors[1] = color;
                face.vertexColors[2] = color;
                break;
            case "min":
                var color = points.reduce((p1, p2) =>
                    p1.elevation < p2.elevation ? p1 : p2
                ).color;

                face.vertexColors[0] = color;
                face.vertexColors[1] = color;
                face.vertexColors[2] = color;
                break;
            case "avg":
                var color = colorGradient.getColor(
                    points.map(p => p.elevation).reduce((e1, e2) => e1 + e2) /
                    points.length
                );
                face.vertexColors[0] = color;
                face.vertexColors[1] = color;
                face.vertexColors[2] = color;
                break;
            case "all":
                face.vertexColors[0] = points[0].color;
                face.vertexColors[1] = points[1].color;
                face.vertexColors[2] = points[2].color;
                break;
            default:
                console.error("bad triangle color setting");
        }
    }

    function getGlobeMaterial() {
        var init = {
            lambert: options => new THREE.MeshLambertMaterial(options),
            standard: options => new THREE.MeshStandardMaterial(options),
            basic: options => new THREE.MeshBasicMaterial(options)
        } [config.material];

        return init({
            vertexColors: THREE.VertexColors,
            side: config.render_globe_interior ? THREE.DoubleSide : THREE.FrontSide
        });
    }

    // Converts a triangle from globe.json into a THREE.Vector3
    // Passed the index of the triangle instead of the triangle itself, to allow for freedom
    function triangleToFace(index, add_colors = true) {
        var triangle = globe.triangles[index];

        var face = new THREE.Face3(triangle.p1, triangle.p2, triangle.p3);

        if (add_colors) {
            colorFace(face, index);
        }

        return face;
    }
    return globe_object;
}